# Rezervační systém — Aninka

Klientská i administrátorská část, databáze a napojení na Google Kalendář.
Celé to běží na bezplatných tarifech.

- `index.html` — klient: přihlášení, balíček, kalendář, rezervace
- `admin.html` — Anina: otevírání termínů, klienti, balíčky, ruční zásahy
- `api/index.js` — veškerá logika na serveru
- `supabase-schema.sql` — databáze, spustit jednou

---

## Jak funguje návaznost tréninků

Aby Anince nevznikaly mezery mezi klienty:

1. Otevře si okno, např. pondělí 8:00–20:00.
2. **První rezervace dne** může kamkoliv — je to kotva.
3. **Každá další se musí dotýkat** už obsazeného času. Klient jiné časy vůbec nevidí.
4. Blok tak roste jako jeden kus a Anina má vždy souvislou šichtu.
5. **Pojistka:** když se den blíží (výchozí 48 h) a okno je poloprázdné, otevře se celé —
   mezera je lepší než prázdný slot. Nastavitelné v administraci, nula pojistku vypne.
6. Anina může přes **ruční rezervaci** vložit trénink kamkoliv, i mimo návaznost a limit.

Rozdělí-li si den na dvě okna (dopoledne, večer), každé má vlastní řetěz.

## Pravidla rezervací

| | |
|---|---|
| Délka tréninku | klient vždy 60 minut; 90 minut může přiřadit jen Anina ručně |
| Balíček 10/20 lekcí | bez týdenního limitu, odečítá se z kreditu |
| Balíček 2×/3× týdně | max 2, resp. 3 rezervace v kalendářním týdnu |
| Nad rámec limitu | jen ručně přes Aninu |
| Storno | klient ruší jen domluvou s Aninou; ona pak rozhodne, zda trénink vrátí do balíčku |
| 90minutový trénink | odečte z balíčku 2 tréninky |

## Přihlášení

Klient se jednou zaregistruje (jméno, příjmení, telefon bez předvolby, e-mail).
Pak stačí zadat telefon. Prohlížeč si přihlášení pamatuje natrvalo.

> Vědomý kompromis: kdo zná cizí telefonní číslo, dostane se do daného účtu.
> Uvidí jen termíny a stav balíčku, nic citlivého. Pokud by to někdy vadilo,
> doplnění čtyřmístného kódu na e-mail je malá změna v `actions.login`.

---

## Zprovoznění

### 1. Supabase — databáze

1. Založit projekt na [supabase.com](https://supabase.com) (tarif Free).
2. **SQL Editor** → vložit celý obsah `supabase-schema.sql` → **Run**.
3. **Project Settings → API** a opsat si:
   - *Project URL* → `SUPABASE_URL`
   - *service_role* klíč → `SUPABASE_SERVICE_KEY`

> `service_role` klíč obchází veškerá oprávnění. Patří výhradně do proměnných
> na Vercelu, nikdy do kódu ani do prohlížeče.

### 2. Vercel — provoz

1. Nový projekt ze stejného repozitáře `annayurtyn/anina-web`.
2. **Root Directory** nastavit na `rezervace`.
3. **Settings → Environment Variables**:

   | Proměnná | Hodnota |
   |---|---|
   | `SUPABASE_URL` | z kroku 1 |
   | `SUPABASE_SERVICE_KEY` | z kroku 1 |
   | `ADMIN_PIN` | PIN, který si zvolí Anina |
   | `PUBLIC_URL` | adresa z kroku 2, např. `https://aninka-rezervace.vercel.app` |
   | `GOOGLE_CLIENT_ID` | z kroku 4 |
   | `GOOGLE_CLIENT_SECRET` | z kroku 4 |

4. Vercel přidělí adresu typu `aninka-rezervace.vercel.app`. Tu doplň do `PUBLIC_URL`
   a použij ji všude níž.

Bez vyplněných `GOOGLE_*` systém funguje normálně, jen se nic nezapisuje do kalendáře.

> Vlastní doména zatím není. Hlavní web běží na GitHub Pages
> (`annayurtyn.github.io/anina-web/`), které serverovou část spustit neumí —
> proto rezervace běží odděleně na Vercelu. Až někdy doména bude, stačí ji
> přidat v *Settings → Domains* a přepsat `PUBLIC_URL` a redirect URI u Googlu.

### 3. Odkaz z hlavního webu

Hlavní web je samostatný projekt na GitHub Pages. Do menu v `index.html`
přidat položku *Rezervace* odkazující na adresu z kroku 2.

### 4. Google Kalendář

1. [console.cloud.google.com](https://console.cloud.google.com) → nový projekt.
2. **APIs & Services → Library** → zapnout **Google Calendar API**.
3. **OAuth consent screen** → typ *External*, vyplnit název a kontakt,
   v **Test users** přidat Aninin Google účet.
4. **Credentials → Create Credentials → OAuth client ID** → *Web application*.
   Do **Authorized redirect URIs** vložit přesně:
   ```
   https://aninka-rezervace.vercel.app/api?gcal=callback
   ```
   (přesně tu adresu, kterou přidělil Vercel)
5. Vzniklé *Client ID* a *Client secret* doplnit na Vercel.
6. Anina otevře `/admin.html` → **Nastavení** → **Propojit Google Kalendář**
   a potvrdí přístup pod svým účtem.

Od té chvíle se každý trénink zapíše do jejího kalendáře a klientovi
dorazí pozvánka na e-mail — Google ji rozešle sám, žádná další služba není potřeba.

---

## První kroky Aniny

1. Otevřít `<adresa>/admin.html`, zadat PIN.
2. **Kalendář** → vybrat rozsah dní, dny v týdnu a okno → *Otevřít termíny*.
3. Rozeslat klientům odkaz `<adresa>`, ať se zaregistrují.
4. **Klienti** → každému přiřadit balíček.

Klienti bez balíčku se zaregistrují a uvidí kalendář, ale rezervovat nemohou,
dokud jim Anina balíček nenastaví.

---

## Co se kam sahá

| Změna | Soubor |
|---|---|
| Délka slotu, krok mřížky | `api/index.js` → `DEFAULT_DURATION`, `SLOT_STEP` |
| Pravidla návaznosti | `api/index.js` → `computeDaySlots` |
| Limity balíčků | `api/index.js` → `assertCanBook` |
| Vzhled | `assets/app.css` |
