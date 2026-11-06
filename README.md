# webBingoGame

Bingo multiplayer, varianta de hârtie jucată între prieteni, cu matrice N×N personalizabilă.
Next.js 16 (App Router), Supabase (Postgres + Realtime Broadcast), deploy pe Vercel.

## Reguli

1. Creatorul camerei alege **N** (3–10, implicit 7) și **L**, numărul de linii necesare pentru câștig (1–3).
   Camera poate avea parolă (opțional).
2. Ceilalți intră cu **codul camerei**, un nickname și parola, dacă există. Poți trimite și linkul `/room/COD`.
3. În lobby, fiecare își pregătește matricea cu numerele 1–N², fiecare o singură dată:
   - **Generează matrice**: serverul face una random. Poți genera alta cât timp nu ești ready.
   - **Completare manuală**: apeși pătrățelele pe rând. Prima apăsare pune 1, a doua 2, … până la N².
4. **I'm ready** blochează matricea. Toți văd live cine e ready. Nimeni nu vede matricea altcuiva.
5. Creatorul pornește jocul când toți sunt ready (minim 2 jucători). Ordinea turelor e ordinea intrării în cameră.
6. Pe tura ta, alegi un număr nestrigat din matricea ta și confirmi cu **Strigă X**. Numărul apare live la toți
   în lista „Numere strigate”, cu ordinea lui.
7. **Bifarea e manuală.** Când altcineva strigă un număr, îl bifezi singur pe matricea ta. Numărul strigat de tine
   se bifează automat.
8. **Validează**: serverul verifică dacă ai cel puțin L linii (rânduri, coloane sau cele 2 diagonale) complet bifate,
   cu toate numerele chiar strigate. Dacă da, câștigi și jocul se termină pentru toți. Dacă nu, primești un mesaj
   și jocul continuă.
9. După final, creatorul poate porni o **rundă nouă** în aceeași cameră.

Host-ul poate **sări tura** unui jucător care nu mai răspunde, ca jocul să nu se blocheze.

## Arhitectură, pe scurt

- Toată logica de joc rulează în Route Handlers (`src/app/api/rooms/...`) cu **service role key**, doar pe server.
- Tabelele au **RLS activat și nicio policy**, plus `revoke` pentru `anon`/`authenticated`.
  Browserul nu poate citi sau scrie direct în DB.
- Live: după fiecare modificare, serverul trimite un semnal **Supabase Realtime Broadcast** pe topicul
  `room:<uuid>`. Clientul face apoi refetch la `/api/rooms/<cod>/state`, care e autentificat.
  Semnalul nu conține date de joc. Există și polling la 15 s, ca rezervă.
- Postgres Changes **nu** funcționează aici, pentru că clientul anonim nu are acces RLS. De aceea se folosește Broadcast.

Detalii: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Schema: [supabase/schema.sql](supabase/schema.sql).

## Setup

### 1. Supabase

1. Creează un proiect pe [supabase.com](https://supabase.com) (planul Free e suficient).
2. **SQL Editor → New query**: lipește tot conținutul din `supabase/schema.sql` și rulează.
3. **Project Settings → API Keys**: copiază
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` / publishable key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` / secret key → `SUPABASE_SERVICE_ROLE_KEY` (**secret**, nu-l pune niciodată în cod)
4. **Realtime → Settings**: lasă activată opțiunea de acces la canale publice (*Allow public access*).
   Aplicația folosește canale Broadcast publice, deci fără ea nu primești update-uri live (doar polling la 15 s).

### 2. Local

```bash
npm install
cp .env.example .env.local   # completează cele 3 valori
npm run dev                  # http://localhost:3000
npm test                     # testele regulilor de joc
```

### 3. Vercel

1. [vercel.com/new](https://vercel.com/new) → **Import** `florin2495/webBingoGame`. Fiind repo privat,
   dă aplicației Vercel acces la el din GitHub, dacă ți se cere.
2. **Settings → Environment Variables**: adaugă cele 3 variabile pentru Production (și Preview, dacă vrei).
3. **Redeploy** după ce adaugi variabilele. `NEXT_PUBLIC_*` se includ în bundle la build,
   deci un deploy făcut înainte de setarea lor nu le are.
4. Fiecare push pe `main` face deploy automat.

### 4. Domeniu propriu

Vercel → proiect → **Settings → Domains → Add** → introdu domeniul. La registrar:
- domeniu apex (`exemplu.ro`): record `A` către IP-ul afișat de Vercel;
- subdomeniu (`bingo.exemplu.ro`): record `CNAME` către valoarea afișată de Vercel.

Certificatul HTTPS se emite automat după propagarea DNS.

## Limitări cunoscute

- Identitatea jucătorului e un token în `localStorage`. Dacă îl ștergi sau schimbi browserul, nu mai poți
  reintra cu același nickname în aceeași rundă.
- Nu există rate limiting și nici ștergere automată a camerelor vechi.
- Maxim 12 jucători pe cameră.
