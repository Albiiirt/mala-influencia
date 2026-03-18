const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

// ── STATE ────────────────────────────────────────────────
let game = {
  active: false,
  mode: null,
  players: [],
  turn: 0,
  round: 1,
  usedCards: new Set(),
  currentCard: null,
  votes: {},
  adminWs: null,
};

function resetGame(keepAdmin = true) {
  game = {
    active: false, mode: null, players: [],
    turn: 0, round: 1, usedCards: new Set(),
    currentCard: null, votes: {},
    adminWs: keepAdmin ? game.adminWs : null,
  };
}

const AVATARS = ['🦊','🐻','🐼','🦁','🐯','🐸','🦋','🦄','🐺','🦝','🐙','🦖','🐨','🦔','🐬'];
const COLORS  = ['#1a73e8','#ea4335','#34a853','#e37400','#9334e6','#007b83','#c5221f','#1557b0','#188038','#b31412'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function sendTo(ws, obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function broadcastPlayers(obj) { game.players.forEach(p => { if (p.ws) sendTo(p.ws, obj); }); }
function broadcastAll(obj) { sendTo(game.adminWs, obj); broadcastPlayers(obj); }
function publicPlayers() {
  return game.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar, color: p.color, ready: p.ready, drinks: p.drinks }));
}

function pickCard() {
  const avail = DECK.map((_,i) => i).filter(i => !game.usedCards.has(i));
  if (!avail.length) { game.usedCards.clear(); return pickCard(); }
  const idx = avail[Math.floor(Math.random() * avail.length)];
  game.usedCards.add(idx);
  return { ...DECK[idx], idx };
}

// ── DECK ─────────────────────────────────────────────────
const DECK = [
  {t:'reto',e:'🕺',txt:'Balla 20 segons només amb la part superior del cos.',drink:'Beus si el grup no aplaudeix.',timer:20},
  {t:'reto',e:'🤳',txt:'Canvia la teva foto de perfil de WhatsApp per la que triï el grup. Mínim 15 minuts.',drink:'Si et negues, beus doble.'},
  {t:'reto',e:'🎤',txt:"Canta el tornada d'una cançó que triï el jugador de la teva dreta.",drink:'Si no la saps, beu i canta igualment.'},
  {t:'reto',e:'🤸',txt:'Fes 15 sentadetes seguides sense parar.',drink:'Si pares abans d\'acabar, beus doble.'},
  {t:'reto',e:'💬',txt:'Envia un missatge estrany a algú dels teus contactes que triï el grup.',drink:'Si et negues, beus i mostres el xat igualment.'},
  {t:'reto',e:'🤐',txt:'No pots parlar durant 3 minuts. Només gestos.',drink:'Cada vegada que parlis sense voler, un glop.'},
  {t:'reto',e:'🦆',txt:"Camina com un ànec d'una banda a l'altra de la sala dues vegades.",drink:'Si rius abans d\'acabar, beus.'},
  {t:'reto',e:'🎭',txt:'Fes un monòleg de 30 segons sobre un tema que triï el grup.',drink:'Si et quedes en blanc més de 5 segons, beus.',timer:30},
  {t:'reto',e:'🧊',txt:'Posa el gel de la teva beguda al cap i aguanta 10 segons.',drink:'Si no aguantes els 10 segons, beus doble.'},
  {t:'reto',e:'📸',txt:'El grup et fa una foto en la postura que triïn. Aquella foto és el teu fons de pantalla 10 minuts.',drink:'Si et negues, beus.'},
  {t:'reto',e:'👁️',txt:'Mira fixament als ulls del jugador que triïs sense riure durant 30 segons.',drink:"El que rigui primer, beu. Si tots dos aguanten, se salven."},
  {t:'reto',e:'🤜',txt:'Xoca el puny amb cada persona del grup dient-los alguna cosa genuïna i positiva.',drink:'Si repeteixes un compliment o sona fals, el grup vota i beus.'},
  {t:'reto',e:'📞',txt:'Truca a algú que no sigui aquí i canta-li Feliç Aniversari. No és el seu aniversari.',drink:'Si penges abans d\'acabar, beus doble.'},
  {t:'reto',e:'🥄',txt:'Menja un gel sencer de la teva beguda sense tocar-lo amb les mans.',drink:'Si uses les mans, beus.'},
  {t:'reto',e:'🎯',txt:'Llança un gel intentant ficar-lo al got d\'un altre jugador. Tres intents.',drink:'Si no en fiques cap, beus.'},
  {t:'reto',e:'🪑',txt:'Seu a la falda d\'algú que triï el grup durant el torn sencer següent.',drink:'Si et negues, beus.'},
  {t:'reto',e:'🙃',txt:'Di tres frases seguides amb les paraules en ordre invers.',drink:'Cada error, un glop.'},
  {t:'reto',e:'🤫',txt:"Xiuxiueja a l'orella del jugador de la teva esquerra alguna cosa que no hagis explicat mai aquí.",drink:'Si el grup convenç el jugador de revelar-ho en 30 segons, beus.'},
  {t:'reto',e:'🦵',txt:'Fes el floss durant 15 segons. No val excusar-se.',drink:'Si pares o caus, beus.'},
  {t:'reto',e:'🎪',txt:'Imita un famós durant 30 segons. El grup ha d\'endevinar qui és.',drink:'Si ningú endevina, beus.',timer:30},
  {t:'verdad',e:'💭',txt:"Quina és la mentida més gran que has dit a algú d'aquest grup?",drink:'Si et negues a respondre, beus doble.'},
  {t:'verdad',e:'😬',txt:"Quina és la cosa més vergonyosa que t'ha passat en els últims 6 mesos?",drink:'Si la història dura menys de 20 segons, beus.'},
  {t:'verdad',e:'❤️',txt:"Amb qui d'aquest grup t'aniríes de viatge sol i per què? Has de nombrar algú.",drink:'Si no nomenes ningú, beus.'},
  {t:'verdad',e:'🔥',txt:"Quina és la teva major obsessió secreta que creus que ningú aquí sap?",drink:'Si el grup ja ho sabia, beven tots.'},
  {t:'verdad',e:'💸',txt:'Quants diners portes ara mateix a sobre o al compte? Sigues específic.',drink:"Si no ho dius o mentes i algú t'enxampa, beus doble."},
  {t:'verdad',e:'🌙',txt:"Quina ha estat la pitjor decisió que has pres aquest any?",drink:'Si et justifiques més de 20 segons en comptes de reconèixer-ho, beus.'},
  {t:'verdad',e:'🤥',txt:"Quina és l'excusa més ridícula que has usat per no quedar amb algú?",drink:"Si el grup vota que no és tan ridícula, te'n lliures. Si voten que sí, beus."},
  {t:'verdad',e:'📲',txt:"Llegeix en veu alta l'últim missatge que has enviat a algú que t'agradava o al teu ex.",drink:'Si no en tens o no vols llegir-lo, beus doble.'},
  {t:'verdad',e:'👀',txt:"A qui d'aquest grup li has explicat alguna cosa que mai hauries hagut d'explicar?",drink:'Si la persona implicada és aquí i reacciona, beus.'},
  {t:'verdad',e:'🍿',txt:"Quin és el teu guilty pleasure més cutre que no reconeixeries fora d'aquí?",drink:'Si el grup ja ho sabia, tu i qui ho sabia beveu junts.'},
  {t:'verdad',e:'🕵️',txt:"Quin és el cotilleig més gros que saps sobre algú que no és aquí?",drink:"Si et negues, beus. Si ho expliques, tots beven d'emoció."},
  {t:'verdad',e:'💔',txt:"Quin va ser el moment exacte en què vas deixar de voler algú que volies?",drink:'Si plores o quasi plores, el grup beu per tu de pena.'},
  {t:'verdad',e:'🧠',txt:"Què pensaves d'algú d'aquest grup quan el vas conèixer versus ara? Nombra algú concret.",drink:'Si no nomenes ningú, beus.'},
  {t:'verdad',e:'🌶️',txt:"Quina és la situació més incòmoda en la qual t'has vist per lligar amb algú?",drink:'Si no has tingut cap situació incòmoda... beus de pena.'},
  {t:'verdad',e:'🪞',txt:"Quina és la cosa que més et costa reconèixer de tu mateix?",drink:'Si la resposta dura menys de 15 segons, beus: ves més al fons.'},
  {t:'verdad',e:'🏆',txt:"De quina cosa estàs més orgullós que ningú d'aquest grup sap encara?",drink:'Si el grup ja ho sabia, beveu tots de celebració.'},
  {t:'verdad',e:'🌊',txt:"Quina és la cosa que més enveja sana et dóna d'algú d'aquest grup? Nombra a qui.",drink:'Si no nomenes ningú, beus.'},
  {t:'verdad',e:'🎭',txt:"Quin és el paper més gran que has interpretat a la teva vida per impressionar algú?",drink:'Si el grup vota que ho continues fent, beus.'},
  {t:'voto',e:'🎬',txt:"Qui del grup seria el primer a morir en una pel·lícula de terror?",drink:'El més votat beu.',voteQ:'Qui mor primer?'},
  {t:'voto',e:'👑',txt:"Qui mana de veritat en aquest grup sense que ningú ho admeti?",drink:'El més votat beu pel poder que té.',voteQ:'Qui mana realment?'},
  {t:'voto',e:'🤥',txt:"Qui exagera més les històries que explica?",drink:"El més votat beu i ha d'explicar una història ara mateix.",voteQ:'Qui exagera més?'},
  {t:'voto',e:'💤',txt:"Qui seria el primer a adormir-se en una nit de festa?",drink:'El més votat beu doble.',voteQ:"Qui s'adorm abans?"},
  {t:'voto',e:'🍕',txt:"Qui seria el pitjor company de pis?",drink:'El més votat beu i accepta el veredicte.',voteQ:'Qui seria pitjor company?'},
  {t:'voto',e:'💘',txt:"Qui té més drama amorós ara mateix tot i dir que no?",drink:'El més votat beu (i pot negar-ho, però beu igualment).',voteQ:'Qui té més drama amorós?'},
  {t:'voto',e:'🧳',txt:"Qui faria les maletes i se n'aniria a viure a un altre país demà?",drink:'El més votat beu. Si és veritat, beu doble.',voteQ:"Qui se'n va a un altre país?"},
  {t:'voto',e:'🤓',txt:"Qui es creu el més llest del grup sense ser-ho necessàriament?",drink:'El més votat beu.',voteQ:'Qui es creu el més llest?'},
  {t:'voto',e:'🚀',txt:"Qui triomfarà més d'aquí 10 anys?",drink:'El més votat convida a la pròxima ronda (o beu si no pot).',voteQ:'Qui triomfarà en 10 anys?'},
  {t:'voto',e:'🌪️',txt:"Qui munta més drama quan les coses no surten com vol?",drink:'El més votat beu. Si protesta, beu més.',voteQ:'Qui munta més drama?'},
  {t:'voto',e:'📵',txt:"Qui és el més addicte al mòbil tot i dir el contrari?",drink:'El més votat deixa el mòbil cap per avall 10 minuts o beu doble.',voteQ:'Qui és més addicte al mòbil?'},
  {t:'voto',e:'🧊',txt:"Qui té menys filtre i diu el que pensa sense que ningú ho hagi demanat?",drink:'El més votat beu i fa una confessió sense filtre ara mateix.',voteQ:'Qui té menys filtre?'},
  {t:'voto',e:'🦋',txt:"Qui ha canviat més des que us coneixeu?",drink:"El més votat beu i explica en què ha canviat.",voteQ:'Qui ha canviat més?'},
  {t:'voto',e:'🍀',txt:"Qui té més sort sense fer res per merèixer-la?",drink:'El més votat beu. No hi ha apel·lació.',voteQ:"Qui té més sort sense merèixer-la?"},
  {t:'voto',e:'😈',txt:"Qui convenceria els altres per fer alguna cosa que tots saben que és mala idea?",drink:'El més votat beu i proposa alguna cosa ara mateix.',voteQ:'Qui convenç per les males idees?'},
  {t:'voto',e:'🥂',txt:"Qui continuarà de festa quan tots els altres ja siguin a casa?",drink:'El més votat beu doble perquè li queda molta nit.',voteQ:'Qui aguanta més la nit?'},
  {t:'voto',e:'🎭',txt:"Qui posa més cara de pocs amics a les fotos del grup?",drink:"El més votat s'ha de fer una foto horrible ara mateix.",voteQ:'Qui posa pitjor cara a les fotos?'},
  {t:'voto',e:'🌶️',txt:"Qui ha tingut més rotllos d'una nit a la seva vida?",drink:'El més votat beu.',voteQ:"Qui ha tingut més rotllos d'una nit?"},
  {t:'grupo',e:'⚡',txt:'TOTS: Pedra, paper o tisores. Eliminatòria fins que quedi un. El que perd cada ronda beu un glop.',drink:'El guanyador final reparteix un glop extra a qui vulgui.'},
  {t:'grupo',e:'🔥',txt:'"Jo mai": cada jugador diu alguna cosa que mai ha fet. Qui ho hagi fet, beu.',drink:'El que més begui en aquesta ronda ha de justificar-se.'},
  {t:'grupo',e:'⏱️',txt:'TOTS parlen alhora durant 30 segons sobre el mateix tema. El que rigui o pari, beu.',drink:'Tema triat per qui ha tret la carta.',timer:30},
  {t:'grupo',e:'🌀',txt:'Tots drets. L\'últim a seure quan el jugador actual cridi "ARA" beu doble.',drink:"El que s'avanci al \"ARA\" també beu.},
  {t:'grupo',e:'🎵',txt:'El jugador actual tarareja una cançó. El primer a endevinar reparteix un glop.',drink:'Si ningú endevina en 30 segons, el que tarareja beu.',timer:30},
  {t:'grupo',e:'🧩',txt:'Història col·lectiva: cada un afegeix UNA frase en ordre. La història ha de tenir sentit.',drink:'Qui trenqui el fil, beu.',timer:120},
  {t:'grupo',e:'🤝',txt:'Tots han de dir alhora la mateixa paraula espontània. Tres intents.',drink:'Si en tres intents no ho aconseguiu, tots beveu.'},
  {t:'grupo',e:'🫵',txt:"El jugador actual assenyala algú i diu una veritat sobre aquella persona.",drink:'Si menteix i el grup ho sap, beu. Si és incòmoda, beu l\'assenyalat.'},
  {t:'grupo',e:'🥊',txt:'Duel de mímica: dos jugadors s\'enfronten 20 segons cada un. El grup vota el millor.',drink:'El perdedor beu.',timer:20},
  {t:'grupo',e:'🎲',txt:"El jugador actual tria un número de l'1 al 10. Cada jugador l'escriu en secret. Els que coincideixin, se salven.",drink:'Els que no coincideixin, beveu.'},
  {t:'grupo',e:'🧠',txt:"Pregunta de cultura general. El primer a respondre bé reparteix un glop.",drink:'Si ningú sap, el que va preguntar beu. Res de Google.'},
  {t:'grupo',e:'🌶️',txt:'"Picant o suau": cada jugador tria. "Suau" = beure ara. "Picant" = confessar alguna cosa compromesa.',drink:'No hi ha terme mig.'},
  {t:'grupo',e:'🎪',txt:"Cadena d'instruccions absurdes: cada jugador afegeix una acció a la llista. Cal recordar i fer totes les anteriors.",drink:"Qui s'equivoqui o oblidi una acció, beu."},
  {t:'grupo',e:'🌟',txt:'Brindis obligatori: cada jugador fa un brindis sincer dirigit a un altre jugador específic.',drink:'Si sona fals i el grup vota que sí, el que ha brindat beu.'},
  {t:'grupo',e:'📢',txt:'El jugador actual llegeix un missatge antic d\'un xat grupal de forma dramàtica. El grup endevina el context.',drink:'Si ningú endevina, el que ha llegit beu.'},
  {t:'grupo',e:'🪩',txt:"Quin ha estat el moment més èpic d'aquesta nit? Cada un proposa un, el grup vota.",drink:'El que proposi el moment amb menys vots, beu de pena.'},
];

// ── WEBSOCKET ─────────────────────────────────────────────
wss.on('connection', (ws) => {
  ws.clientId = Math.random().toString(36).slice(2);
  ws.role = null;

  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {

      // ─ ADMIN ─
      case 'admin_connect':
        game.adminWs = ws; ws.role = 'admin';
        sendTo(ws, { type:'admin_ok', players:publicPlayers(), active:game.active, mode:game.mode });
        break;

      case 'admin_start_lobby':
        resetGame();
        game.mode = msg.mode;
        game.adminWs = ws;
        sendTo(ws, { type:'lobby_open', mode:game.mode });
        break;

      case 'admin_add_player': {
        if (game.active) break;
        const p = { id:'local_'+Date.now(), name:msg.name, avatar:rand(AVATARS), color:COLORS[game.players.length % COLORS.length], ready:true, drinks:0, ws:null };
        game.players.push(p);
        sendTo(ws, { type:'players_update', players:publicPlayers() });
        break;
      }

      case 'admin_remove_player':
        game.players = game.players.filter(p => p.id !== msg.id);
        sendTo(ws, { type:'players_update', players:publicPlayers() });
        break;

      case 'admin_start_game':
        if (game.players.length < 1) { sendTo(ws, { type:'error', msg:"Cal almenys 1 jugador per començar." }); break; }
        game.active = true; game.turn = 0; game.round = 1;
        game.usedCards.clear(); game.players.forEach(p => p.drinks = 0);
        broadcastAll({ type:'game_started', players:publicPlayers(), turn:0, round:1, mode:game.mode });
        break;

      case 'admin_flip_card': {
        if (!game.active) break;
        const card = pickCard(); game.currentCard = card; game.votes = {};
        broadcastAll({ type:'card_flipped', card });
        break;
      }

      case 'admin_reveal_votes': {
        const counts = {};
        game.players.forEach(p => counts[p.id] = 0);
        Object.values(game.votes).forEach(id => { if (id in counts) counts[id]++; });
        broadcastAll({ type:'votes_revealed', counts });
        break;
      }

      case 'admin_next_turn':
        if (!game.active) break;
        game.turn = (game.turn + 1) % game.players.length;
        if (game.turn === 0) game.round++;
        game.votes = {}; game.currentCard = null;
        if (game.round > 10) broadcastAll({ type:'game_over', players:publicPlayers() });
        else broadcastAll({ type:'next_turn', turn:game.turn, round:game.round, players:publicPlayers() });
        break;

      case 'admin_play_again':
        game.turn = 0; game.round = 1; game.usedCards.clear(); game.votes = {}; game.currentCard = null;
        game.players.forEach(p => p.drinks = 0);
        broadcastAll({ type:'game_started', players:publicPlayers(), turn:0, round:1, mode:game.mode });
        break;

      case 'admin_end_game':
        resetGame();
        sendTo(ws, { type:'admin_ok', players:[], active:false, mode:null });
        broadcastPlayers({ type:'game_ended' });
        break;

      // ─ PLAYER ─
      case 'player_join': {
        if (game.mode !== 'multi') { sendTo(ws, { type:'error', msg:'Aquesta sala no accepta jugadors externs.' }); break; }
        const name = (msg.name||'').trim().slice(0,14);
        if (!name) { sendTo(ws, { type:'error', msg:"Has d'introduir un nom." }); break; }
        ws.role = 'player';
        const pl = { id:ws.clientId, name, avatar:rand(AVATARS), color:COLORS[game.players.length%COLORS.length], ready:false, drinks:0, ws };
        game.players.push(pl);
        sendTo(ws, { type:'joined', player:{ id:pl.id, name:pl.name, avatar:pl.avatar, color:pl.color } });
        sendTo(game.adminWs, { type:'players_update', players:publicPlayers() });
        broadcastPlayers({ type:'players_update', players:publicPlayers() });
        break;
      }

      case 'player_ready': {
        const pl = game.players.find(p => p.id === ws.clientId);
        if (pl) { pl.ready = msg.ready; sendTo(game.adminWs, { type:'players_update', players:publicPlayers() }); broadcastPlayers({ type:'players_update', players:publicPlayers() }); }
        break;
      }

      case 'player_done': {
        const pl = game.players.find(p => p.id === ws.clientId);
        if (pl && msg.drink) pl.drinks++;
        sendTo(game.adminWs, { type:'player_done', playerId:ws.clientId });
        break;
      }

      case 'player_vote':
        if (game.votes[ws.clientId]) break;
        game.votes[ws.clientId] = msg.targetId;
        sendTo(ws, { type:'vote_registered' });
        const prog = { type:'vote_progress', count:Object.keys(game.votes).length, total:game.players.length };
        sendTo(game.adminWs, prog); broadcastPlayers(prog);
        break;
    }
  });

  ws.on('close', () => {
    if (ws.role === 'player') {
      game.players = game.players.filter(p => p.id !== ws.clientId);
      sendTo(game.adminWs, { type:'players_update', players:publicPlayers() });
      broadcastPlayers({ type:'players_update', players:publicPlayers() });
    }
    if (ws.role === 'admin') game.adminWs = null;
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🃏 Mala Influència — port ${PORT}`));
