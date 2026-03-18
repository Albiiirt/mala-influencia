# 🃏 Mala Influència v2

Joc de cartes per a reunions amb amics. Tu ets l'amfitrió i tens el control total.

---

## Com funciona

### Tu (amfitrió)
- Obres `https://el-teu-domini.railway.app` al teu mòbil → pantalla d'admin
- Tries el mode: **multidispositiu** o **un sol dispositiu**
- Controles el ritme del joc (passes de torn, reveals de votació, etc.)

### Els teus amics (mode multidispositiu)
- Escanegen el QR que apareix a la teva pantalla
- S'obre el navegador al seu mòbil directament — **sense instal·lar res**
- Posen el nom, premen «Preparat» i esperen
- Quan els toca, veuen la carta al seu mòbil i premen «He fet el repte»

### Mode un sol dispositiu
- Afegeixes els jugadors manualment (nom per nom)
- El mòbil passa de mà en mà
- Les cartes surten a la pantalla d'admin

---

## Estructura

```
mala-influencia/
├── server.js          ← Servidor Node.js + WebSockets
├── package.json
└── public/
    ├── index.html     ← Redirigeix a admin.html
    ├── admin.html     ← La teva pantalla (amfitrió)
    └── player.html    ← Pantalla dels jugadors (via QR)
```

---

## Desplegament a Railway (pas a pas)

### 1. Puja a GitHub

1. Crea un repositori nou a **github.com** → "New repository" → nom: `mala-influencia` → Public
2. Puja tots els fitxers mantenint l'estructura de carpetes (`public/` ha de ser una carpeta)
3. Commit

### 2. Deploya a Railway

1. Entra a **railway.app** → "New Project" → "Deploy from GitHub repo"
2. Connecta el compte de GitHub i selecciona `mala-influencia`
3. Railway detecta Node.js i desplega automàticament
4. Ves a **Settings → Networking → Generate Domain**
5. Obtens una URL tipus: `https://mala-influencia.up.railway.app`

### 3. A jugar!

- **Tu** obres `https://mala-influencia.up.railway.app` al teu mòbil
- **Els amics** escanegen el QR que apareix a la teva pantalla

---

## Notes

- Railway en el pla gratuït pot "adormir" l'app si porta una estona sense ús. La primera persona que entri pot trigar 5-10 segons. Després va fluid.
- El QR apunta sempre a `/player.html` de la teva URL pública.
