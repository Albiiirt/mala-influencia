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
  {t:'reto',e:'🕺',txt:`Balla 20 segons només amb la part superior del cos.`,drink:`Beus si el grup no aplaudeix.`,timer:20},
  {t:'reto',e:'🤳',txt:`Canvia la teva foto de perfil de WhatsApp per la que triï el grup. Mínim 15 minuts.`,drink:`Si et negues, beus doble.`},
  {t:'reto',e:'🎤',txt:`Canta el tornada d'una cançó que triï el jugador de la teva dreta.`,drink:`Si no la saps, beu i canta igualment.`},
  {t:'reto',e:'🤸',txt:`Fes 15 sentadetes seguides sense parar.`,drink:`Si pares abans d'acabar, beus doble.`},
  {t:'reto',e:'💬',txt:`Envia un missatge estrany a algú dels teus contactes que triï el grup.`,drink:`Si et negues, beus i mostres el xat igualment.`},
  {t:'reto',e:'🤐',txt:`No pots parlar durant 3 minuts. Només gestos.`,drink:`Cada vegada que parlis sense voler, un glop.`},
  {t:'reto',e:'🦆',txt:`Camina com un ànec d'una banda a l'altra de la sala dues vegades.`,drink:`Si rius abans d'acabar, beus.`},
  {t:'reto',e:'🎭',txt:`Fes un monòleg de 30 segons sobre un tema que triï el grup.`,drink:`Si et quedes en blanc més de 5 segons, beus.`,timer:30},
  {t:'reto',e:'🧊',txt:`Posa el gel de la teva beguda al cap i aguanta 10 segons.`,drink:`Si no aguantes els 10 segons, beus doble.`},
  {t:'reto',e:'📸',txt:`El grup et fa una foto en la postura que triïn. Aquella foto és el teu fons de pantalla 10 minuts.`,drink:`Si et negues, beus.`},
  {t:'reto',e:'👁️',txt:`Mira fixament als ulls del jugador que triïs sense riure durant 30 segons.`,drink:`El que rigui primer, beu. Si tots dos aguanten, se salven.`},
  {t:'reto',e:'🤜',txt:`Xoca el puny amb cada persona del grup dient-los alguna cosa genuïna i positiva.`,drink:`Si repeteixes un compliment o sona fals, el grup vota i beus.`},
  {t:'reto',e:'📞',txt:`Truca a algú que no sigui aquí i canta-li Feliç Aniversari. No és el seu aniversari.`,drink:`Si penges abans d'acabar, beus doble.`},
  {t:'reto',e:'🥄',txt:`Menja un gel sencer de la teva beguda sense tocar-lo amb les mans.`,drink:`Si uses les mans, beus.`},
  {t:'reto',e:'🎯',txt:`Llança un gel intentant ficar-lo al got d'un altre jugador. Tres intents.`,drink:`Si no en fiques cap, beus.`},
  {t:'reto',e:'🪑',txt:`Seu a la falda d'algú que triï el grup durant el torn sencer següent.`,drink:`Si et negues, beus.`},
  {t:'reto',e:'🙃',txt:`Di tres frases seguides amb les paraules en ordre invers.`,drink:`Cada error, un glop.`},
  {t:'reto',e:'🤫',txt:`Xiuxiueja a l'orella del jugador de la teva esquerra alguna cosa que no hagis explicat mai aquí.`,drink:`Si el grup convenç el jugador de revelar-ho en 30 segons, beus.`},
  {t:'reto',e:'🦵',txt:`Fes el floss durant 15 segons. No val excusar-se.`,drink:`Si pares o caus, beus.`},
  {t:'reto',e:'🎪',txt:`Imita un famós durant 30 segons. El grup ha d'endevinar qui és.`,drink:`Si ningú endevina, beus.`,timer:30},
  {t:'verdad',e:'💭',txt:`Quina és la mentida més gran que has dit a algú d'aquest grup?`,drink:`Si et negues a respondre, beus doble.`},
  {t:'verdad',e:'😬',txt:`Quina és la cosa més vergonyosa que t'ha passat en els últims 6 mesos?`,drink:`Si la història dura menys de 20 segons, beus.`},
  {t:'verdad',e:'❤️',txt:`Amb qui d'aquest grup t'aniríes de viatge sol i per què? Has de nombrar algú.`,drink:`Si no nomenes ningú, beus.`},
  {t:'verdad',e:'🔥',txt:`Quina és la teva major obsessió secreta que creus que ningú aquí sap?`,drink:`Si el grup ja ho sabia, beven tots.`},
  {t:'verdad',e:'💸',txt:`Quants diners portes ara mateix a sobre o al compte? Sigues específic.`,drink:`Si no ho dius o mentes i algú t'enxampa, beus doble.`},
  {t:'verdad',e:'🌙',txt:`Quina ha estat la pitjor decisió que has pres aquest any?`,drink:`Si et justifiques més de 20 segons en comptes de reconèixer-ho, beus.`},
  {t:'verdad',e:'🤥',txt:`Quina és l'excusa més ridícula que has usat per no quedar amb algú?`,drink:`Si el grup vota que no és tan ridícula, te'n lliures. Si voten que sí, beus.`},
  {t:'verdad',e:'📲',txt:`Llegeix en veu alta l'últim missatge que has enviat a algú que t'agradava o al teu ex.`,drink:`Si no en tens o no vols llegir-lo, beus doble.`},
  {t:'verdad',e:'👀',txt:`A qui d'aquest grup li has explicat alguna cosa que mai hauries hagut d'explicar?`,drink:`Si la persona implicada és aquí i reacciona, beus.`},
  {t:'verdad',e:'🍿',txt:`Quin és el teu guilty pleasure més cutre que no reconeixeries fora d'aquí?`,drink:`Si el grup ja ho sabia, tu i qui ho sabia beveu junts.`},
  {t:'verdad',e:'🕵️',txt:`Quin és el cotilleig més gros que saps sobre algú que no és aquí?`,drink:`Si et negues, beus. Si ho expliques, tots beven d'emoció.`},
  {t:'verdad',e:'💔',txt:`Quin va ser el moment exacte en què vas deixar de voler algú que volies?`,drink:`Si plores o quasi plores, el grup beu per tu de pena.`},
  {t:'verdad',e:'🧠',txt:`Què pensaves d'algú d'aquest grup quan el vas conèixer versus ara? Nombra algú concret.`,drink:`Si no nomenes ningú, beus.`},
  {t:'verdad',e:'🌶️',txt:`Quina és la situació més incòmoda en la qual t'has vist per lligar amb algú?`,drink:`Si no has tingut cap situació incòmoda... beus de pena.`},
  {t:'verdad',e:'🪞',txt:`Quina és la cosa que més et costa reconèixer de tu mateix?`,drink:`Si la resposta dura menys de 15 segons, beus: ves més al fons.`},
  {t:'verdad',e:'🏆',txt:`De quina cosa estàs més orgullós que ningú d'aquest grup sap encara?`,drink:`Si el grup ja ho sabia, beveu tots de celebració.`},
  {t:'verdad',e:'🌊',txt:`Quina és la cosa que més enveja sana et dóna d'algú d'aquest grup? Nombra a qui.`,drink:`Si no nomenes ningú, beus.`},
  {t:'verdad',e:'🎭',txt:`Quin és el paper més gran que has interpretat a la teva vida per impressionar algú?`,drink:`Si el grup vota que ho continues fent, beus.`},
  // ... resto de cartas sigue igual, aplicar backticks si hay comillas dentro
];