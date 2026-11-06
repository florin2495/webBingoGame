# Arhitectură

## Componente

```
Browser (Next.js client)                Vercel (Route Handlers, Node)            Supabase
------------------------                -----------------------------            --------
fetch /api/rooms/...  ───────────────▶  validare + logică de joc   ──service──▶  Postgres (RLS on,
  header x-player-token                 (service role key, doar                   fără policies)
                                         server-side)
                                              │
                                              └── httpSend("refresh") ─────────▶  Realtime Broadcast
supabase.channel("room:<id>") ◀───────────────────────────────────────────────── topic room:<roomId>
  la orice eveniment → refetch GET /api/rooms/<code>/state
```

## Decizii

1. **Realtime prin Broadcast, nu Postgres Changes.** Postgres Changes livrează evenimente doar
   dacă clientul are acces de citire prin RLS. Clientul anonim nu are acces la nicio tabelă, deci
   serverul trimite un eveniment Broadcast (REST, `channel.httpSend`) după fiecare modificare.
2. **Evenimentele nu conțin date, doar semnale.** Payload-ul e `{ kind }`. Clientul face apoi
   refetch la `/state`, care e autentificat. Un canal public de Broadcast poate fi ascultat sau
   chiar folosit pentru trimitere de oricine știe topicul. Cel mai rău caz e un refetch în plus,
   niciodată o matrice divulgată. Topicul folosește UUID-ul camerei, nu codul de 6 caractere.
   Clientul face și polling la 15 s, ca rezervă dacă se pierde conexiunea WebSocket.
3. **Identitatea jucătorului = token aleator.** La creare sau intrare, serverul generează 32 de bytes
   random. Clientul îl ține în `localStorage`, iar DB-ul păstrează doar SHA-256. Fiecare request trimite
   `x-player-token`, iar serverul verifică `token → player` și `player.room_id == camera din URL`.
4. **Parola camerei** e stocată ca hash `scrypt` cu salt. Verificarea folosește `timingSafeEqual`.
5. **Race conditions fără lock-uri:** `called_numbers` are `unique(room, round, number)` și
   `unique(room, round, seq)`. Tura e dedusă din `seq`, deci două strigări concurente pentru același
   slot nu pot trece amândouă. Câștigul e un `UPDATE ... WHERE status = 'playing'` condiționat, deci
   un singur câștigător.
6. **Tura curentă** = `turn_order[(numere_strigate + turn_offset) mod jucători]`. `turn_order` se
   fixează la start, în ordinea intrării în cameră. Host-ul poate sări tura unui jucător absent
   (`turn_offset++`).
7. **Runde:** `boards`, `called_numbers` și `marks` au coloana `round`. Runda nouă face `round++`,
   `status = lobby` și resetează `ready`. Rundele vechi rămân în DB.

## Fluxul stărilor

`lobby` → (host: start, toți ready, ≥2 jucători) → `playing` → (validare reușită) → `finished`
→ (host: rundă nouă) → `lobby`

## API (toate sub `/api/rooms`)

| Metodă | Rută | Cine | Ce face |
| --- | --- | --- | --- |
| POST | `/api/rooms` | oricine | creează camera + jucătorul host |
| POST | `/[code]/join` | oricine | intră în cameră (doar în lobby) |
| GET | `/[code]/state` | membru | starea camerei + matricea și bifările proprii |
| POST | `/[code]/board` | membru, lobby, ne-ready | `{generate:true}` sau `{cells:[...]}` |
| POST | `/[code]/ready` | membru, lobby, matrice salvată | marchează ready, blochează matricea |
| POST | `/[code]/start` | host, toți ready | pornește jocul |
| POST | `/[code]/call` | jucătorul la tură | strigă un număr (și îl bifează la el) |
| POST | `/[code]/mark` | membru, playing | bifează/debifează un număr pe matricea proprie |
| POST | `/[code]/validate` | membru, playing | verifică L linii complete și corecte |
| POST | `/[code]/skip` | host, playing | sare tura curentă |
| POST | `/[code]/new-round` | host, finished | rundă nouă |

## Limitări cunoscute

- Dacă un jucător își pierde `localStorage`, nu se mai poate reconecta cu același nickname.
- Nu există rate limiting. Pentru un joc între prieteni e acceptabil, dar nu pentru o aplicație publică.
- Camerele vechi nu se șterg automat.
