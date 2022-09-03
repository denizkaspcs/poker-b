const axios = require('axios');
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const cors = require('cors');
const { response } = require('express');
const io = new Server(server, {
    cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
let room_array = [];
let to_return = [];




const find_index = (id) => {
    for (let i = 0; i < room_array.length; i++){
        if (room_array[i].id == id) {
            return i;
        }
    }
    return -1;
}

const find_participant = (index, name) => {
    for (let i = 0; i < room_array[index].participants.length; i++){
        if (room_array[index].participants[i].name == name) {
            return i;
        }
    }
    return -1;
}

const draw_for_players = async (room_id) => {
    let temp = "";
    let temp2 = "";

    for (let i = 0; i < room_array[room_id].participant_count; i++){
        temp = "";
        temp2 = "";
        await axios.get(`https://www.deckofcardsapi.com/api/deck/${room_array[room_id].deck.deck_id}/draw/?count=2`).then((response) => {
            room_array[room_id].participants[i].hand.push(response.data.cards[0].image);
            room_array[room_id].participants[i].hand.push(response.data.cards[1].image);
            //source of embarrasment
            if (response.data.cards[0].code.includes("0")) {
                temp = "1" + response.data.cards[0].code;
            } else {
                temp = response.data.cards[0].code;
            }
            if (response.data.cards[1].code.includes("0")) {
                temp2 = "1" + response.data.cards[1].code;
            } else {
                temp2 = response.data.cards[1].code;
            }
            
            room_array[room_id].participants[i].hand_str.push(temp);
            room_array[room_id].participants[i].hand_str.push(temp2);
            
        })
        room_array[room_id].participants[i].role = "Player";
    }
    const room_size = room_array[room_id].participant_count;
    const dealer = room_array[room_id].round;
    room_array[room_id].participants[(dealer % room_size)].role = "Dealer";
    room_array[room_id].participants[((dealer + room_size - 1) % room_size)].role = "Small Blind";
    room_array[room_id].participants[((dealer + room_size - 2) % room_size)].role = "Big Blind";
    //handle money for blinds
    room_array[room_id].participants[((dealer + room_size - 1) % room_size)].money -= room_array[room_id].small_blind;
    room_array[room_id].participants[((dealer + room_size - 2) % room_size)].money -= room_array[room_id].small_blind*2;

    room_array[room_id].participants[((dealer + room_size - 1) % room_size)].has_paid += parseInt(room_array[room_id].small_blind);
    room_array[room_id].participants[((dealer + room_size - 2) % room_size)].has_paid += room_array[room_id].small_blind*2;
    
    room_array[room_id].current_bid = room_array[room_id].small_blind*2; //big blind
    room_array[room_id].pot = room_array[room_id].small_blind * 3;
    //some logic abt bidding
    //this function draws cards for the participants so it initializes the round
    //on the first round the bidding logic is different since small blind completes then big blind can raise,
    //so we act like big blind did not bet that round,
    //the money/pot logic is completed on the front end as the slider allows certain bets
    room_array[room_id].last_bidder_id = ((dealer + (2*room_size) - 3) % room_size);
    
    room_array[room_id].bidding = ((dealer + (2*room_size) - 3) % room_size);
}

app.use(express.json());
app.use(cors());
app.options('*', cors()); //put this before your route

app.get('/', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
    res.send("success");
})
app.post('/createRoom', (req, res) => {
    const id = req.body.id;
    const name = req.body.name;
    const money = req.body.money
    const small_blind = req.body.small_blind
    let participant = {
        participant_id : 0,
        name: name,
        king: true,
        hand: [],
        hand_str:[],
        role: "Player",
        money: money,
        has_paid: 0,
        has_folded : false
    }
    let room = {
        id: id,
        turn_over:false,
        active_players:0,
        money: money,
        small_blind:small_blind,
        participant_count: 1,
        participants: [participant],
        round: -1,
        current_bid: 0,
        bidding: 0,
        last_bidder_id: 0,
        pot: 0,
        floor_cards: [],
        floor_cards_str:[],
        deck: {
            deck_id: "",
            remaining: 0
        }
    };
    room_array.push(room);
    res.json({
        statusCode: 200,
        message: "success",
        participant_id: 0
    });
    return;
})
app.post('/enterRoom', (req, res) => {
    const id = req.body.id;
    const name = req.body.name;
    let room = find_index(id);
    
    if (room != -1) {
        let participant = {
            name: name,
            participant_id: room_array[room].participant_count,
            king: false,
            hand: [],
            hand_str:[],
            role: "Player",
            money: room_array[room].money,
            has_paid: 0,
            has_folded: false
        }
        room_array[room].participants.push(participant);
        room_array[room].participant_count++;
        res.json({
            statusCode: 200,
            message: "success",
            room: room_array[room],
            participant_id: room_array[room].participant_count - 1
        })
        io.emit('enter', room_array[room]);
    } else {
        res.json({
            statusCode: 400,
            message:"failed"
        })
    }
})
app.get('/get_participant', (req,res) => {
    const name = req.query.name;
    const room = req.query.room;
    let index = find_index(room);
    if (index == -1) {
        res.json({
            statusCode: 400,
            message: "failed"
        });
        return;
    } else {
        let participant_index = find_participant(index, name);
        if (participant_index != -1) {
            res.json({
                statusCode: 200,
                message:"success",
                participant: room_array[index].participants[participant_index]
            })
        } else {
            res.json({
                statusCode: 400,
                message: "failed"
            });
            return;            
        }
    }
    return 200;

})
app.get('/get_deck', (req, res) => {
    const room_id = req.query.room_id;
    axios.get("http://www.deckofcardsapi.com/api/deck/new/shuffle/?deck_count=1").then((response) => {
        let index = find_index(room_id);
        if (index != -1) {
            room_array[index].deck.deck_id = response.data.deck_id;
            room_array[index].deck.remaining = response.data.remaining;            
        }
    }).catch((err) => {
        console.log(err);
        
    })
    res.json({
        statusCode: 200,
        message: "success"
    });
    return;
})

app.get('/start', async (req, res) => {
    const room_id = req.query.room_id;
    const index = find_index(room_id);
    if (index != -1) {
        for (let i = 0; i < room_array[index].participant_count; i++){
            room_array[index].participants[i].hand = [];
            room_array[index].participants[i].hand_str = [];
            room_array[index].participants[i].role = "Player";
            room_array[index].participants[i].has_paid = 0;
            room_array[index].participants[i].has_folded = false;
        }
        room_array[index].turn_over = false;
        room_array[index].round += 1;
        room_array[index].current_bid = 0;
        room_array[index].bidding = 0;
        room_array[index].last_bidder_id = 0;
        room_array[index].pot = 0;
        room_array[index].floor_cards = [];
        room_array[index].floor_cards_str = [];
        room_array[index].active_players = room_array[index].participant_count;

        await shuffle_deck(room_array[index].deck.deck_id,index);
        await draw_for_players(index);    
    
    };
    res.json({
        statusCode: 200,
        message: "success"
    });

    return;
})

const shuffle_deck = async (deck_id,index) => {
    await axios.get(`http://deckofcardsapi.com/api/deck/${deck_id}/shuffle/`).then((response) => {
        return;
    })
}

const draw_cards_and_return = async (deck_id,count,index) => {
    let temp = "";
    await axios.get(`http://deckofcardsapi.com/api/deck/${deck_id}/draw/?count=${count}`).then((response) => {
        for (let i = 0; i < response.data.cards.length; i++){
            room_array[index].floor_cards.push(response.data.cards[i].image);
            
            if (response.data.cards[i].code.includes("0")) {
                temp = "1" + response.data.cards[i].code;
            } else {
                temp = response.data.cards[i].code;
            }
            room_array[index].floor_cards_str.push(temp);
        }
    }).catch((err) => {
        console.log(err)
    })
    return;
}

const calculate_winner = async (index) => {
    to_return = [];
    const temp = room_array[index].floor_cards_str
    const player_hands_arr = new Array(room_array[index].participant_count);
    let url = `https://api.pokerapi.dev/v1/winner/texas_holdem?cc=${temp[0]},${temp[1]},${temp[2]},${temp[3]},${temp[4]}`;
    for (let i = 0; i < room_array[index].participant_count; i++){
        if (room_array[index].participants[i].has_folded === false) {
            url += `&pc[]=${room_array[index].participants[i].hand_str[0]},${room_array[index].participants[i].hand_str[1]}`
            player_hands_arr[i] = `${room_array[index].participants[i].hand_str[0]},${room_array[index].participants[i].hand_str[1]}`            
        }
    }
    await axios.get(url).then((response) => {
        for (let i = 0; i < response.data.winners.length; i++){
            for (let j = 0; j < room_array[index].participant_count; j++){
                if (room_array[index].participants[j].has_folded === false) {
                    if (response.data.winners[i].cards === player_hands_arr[j]) {
                        to_return.push(room_array[index].participants[j].participant_id);
                    }                    
                }
            }
        }
        return;

    }).catch((err) => {
        console.log(err);
    })
    //"&pc[]=3S,2C&pc[]=KS,JC&pc[]=KH,JH`
    
}

io.on('connection', (socket) => {
    console.log('a user connected');
    socket.on('disconnect', () => {
        console.log("disconnect")
    });
    socket.on('start', (obj) => {

        let index = find_index(obj);
        if (index == -1) return;

        io.emit('get_participants',room_array[index])
    })
    //last bidding should be equal to first bidding, so that the one that bets first will end the round if there is no raise
    socket.on('new_bid', (obj) => {
        //log new bid object
        console.log(obj)
        //find the room from the bid event
        let index = find_index(obj.room);
        if (index == -1) return;
        //get the new bid and see if there is a raise
        if (room_array[index].current_bid < (obj.bid + obj.has_paid)) {
            room_array[index].last_bidder_id = obj.id;
            room_array[index].current_bid = (obj.bid + obj.has_paid);
        }        
        
        //take the money from the bidder and add it to the pot,
        const p_index = find_participant(index, obj.name);
        if (p_index != -1) {
            room_array[index].participants[p_index].money -= obj.bid;
            room_array[index].participants[p_index].has_paid += parseInt(obj.bid);
            room_array[index].pot += obj.bid;
        }
        let check_first_fold = false;


        //check if player has folded
        if (obj.has_folded) {
            room_array[index].participants[p_index].has_folded = true;
            room_array[index].active_players -= 1;
            if (room_array[index].active_players === 1) {
                for (let i = 0; i < room_array[index].participant_count; i++){
                    if (room_array[index].participants[i].has_folded === false) {
                        room_array[index].participants[i].money += room_array[index].pot;
                        room_array[index].pot = 0;
                        room_array[index].turn_over = true;
                        for (let k = 0; k < room_array[index].participant_count; k++){
                            room_array[index].participants[k].has_paid = 0;
                        }

                        io.emit('get_state', room_array[index]);
                        return;
                    }
                }
            }
            if (room_array[index].last_bidder_id === obj.id) {
                check_first_fold = true;
                while (room_array[index].participants[room_array[index].last_bidder_id].has_folded) {
                    room_array[index].last_bidder_id = ((room_array[index].last_bidder_id + room_array[index].participant_count -1) % room_array[index].participant_count)
                }
            }
        }
        //find and assign the new bidder
        let count = room_array[index].participant_count;
        let temp = room_array[index].bidding
        
        //go around the room in negative direction to find next bidder
        temp = (count + temp - 1) % count;
        while(room_array[index].participants[temp].has_folded) {
            temp = (count + temp - 1) % count;        
        }
        room_array[index].bidding = temp;


        //checks if bidding sessions should end
        //if the bet was a raise, the last bidder field is equal to the raiser,
        //we already pointed the bidding field to the next player
        //so in case of a raise, another bet round will occur
        //if the next player we have pointed to is the last bidder, the session is over and a different message is emitted???
        if (check_first_fold !== true && temp === room_array[index].last_bidder_id) {
            //end bidding round and draw cards
            //reset the room settings,
            //reset current_bid,bidding,last_bidding,participants[i].has_paid etc..

            if (room_array[index].floor_cards.length === 5) {
                //determine winner
                calculate_winner(index).then(() => {
                    console.log("winners: ")
                    console.log(to_return)
                    if (to_return.length === 1) {
                        room_array[index].participants[to_return[0]].money += room_array[index].pot;
                        room_array[index].pot = 0;

                    } else if (to_return.length > 1) {
                        for (let i = 0; i < to_return.length; i++){
                            room_array[index].participants[to_return[i]].money += Math.floor(room_array[index].pot / to_return.length)
                        }
                        room_array[index].pot = 0;
                    }
                    room_array[index].turn_over = true;
                    io.emit('get_state', room_array[index]);
                }).catch((err) => {
                    console.log(err);
                });
            } else {
                const room_size = room_array[index].participant_count;
                const dealer = room_array[index].round;
                
                room_array[index].current_bid = 0;
                room_array[index].bidding = ((dealer + room_size - 1) % room_size);
                while (room_array[index].participants[room_array[index].bidding].has_folded) {
                    room_array[index].bidding = ((room_array[index].bidding + room_array[index].participant_count - 1) % room_array[index].participant_count);                    
                }
                room_array[index].last_bidder_id = room_array[index].bidding;

                for (let i = 0; i < room_array[index].participant_count; i++){
                    room_array[index].participants[i].has_paid = 0;
                }

                //draw cards and send to front,
                draw_cards_and_return(room_array[index].deck.deck_id, room_array[index].floor_cards.length === 0 ? 3 : 1, index).then(() => {
                    io.emit('draw_cards', room_array[index]);            
                });
                
            }

        } else {
            //emit new game state, wait for new bid
            io.emit('get_state', room_array[index]);             
        }

    })

})





const PORT = process.env.PORT || 8080;

server.listen(PORT);

/*

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
  console.log('Press Ctrl+C to make quit.');
});
*/