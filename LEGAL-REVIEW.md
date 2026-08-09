# Rechtsprüfung: `/impressum/` und `/datenschutz/`

Review of `src/pages/impressum.astro` and `src/pages/datenschutz.astro` against Austrian law
(MedienG, ECG, GewO, VerG, AStG, TKG 2021) and the GDPR.

**Stand:** 2026-08-09
**Geprüfte Dateien:** `src/pages/impressum.astro`, `src/pages/datenschutz.astro`
**Mitgeprüft (Kontext):** `src/layouts/BaseLayout.astro`, `src/components/VideoSection.astro`,
`src/components/SiteFooter.astro`, `src/styles/global.css`, `src/data/members.ts`,
`astro.config.mjs`, `.github/workflows/deploy.yml`

> ⚠️ **Kein Rechtsrat.** Vor dem Verlassen auf diese Prüfung anwaltlich abklären lassen.

---

## Was technisch verifiziert wurde

Die folgenden Aussagen der Datenschutzerklärung wurden gegen den Code geprüft und sind **zutreffend**:

| Aussage | Prüfung | Ergebnis |
| --- | --- | --- |
| Keine Google Fonts, keine externen Bilddienste | `src/styles/global.css:21-26` — nur `@fontsource`-Importe, selbst gehostet | ✅ |
| Social-Links sind reine Links, keine Widgets/Pixel | `src/components/SiteFooter.astro:44-58` — nur `<a>` + Inline-SVG | ✅ |
| YouTube lädt erst nach ausdrücklicher Einwilligung | `src/components/VideoSection.astro:149-171` — Embed-URL sitzt ausschließlich am Bestätigen-Button | ✅ |
| Keine Cookies, kein Local/Session Storage, keine Formulare | Projektweite Suche — keine Treffer | ✅ |
| Simple Analytics ist der einzige Drittanbieter-Request beim normalen Seitenaufruf | `src/layouts/BaseLayout.astro:150` | ✅ |

Zusätzlich positiv: die Zwei-Schritt-Einwilligung für das Video, die gleichwertige Gestaltung von
Zustimmen-/Ablehnen-Button (`VideoSection.astro:433-448`) und die Zitierung von § 78 UrhG sind
inhaltlich richtig und bewusst gesetzt.

---

## 🔴 Blockierend: Die Live-Seite enthält Platzhalter

`https://karin112358.github.io/the-bumblebees/impressum/` ist **derzeit online** und zeigt:

```
[Straße und Hausnummer]
[PLZ] [Ort]
Telefon: [+43 000 0000000]
Rechtsform: [z. B. nicht eingetragene Band / Verein / GesbR]
Stand: [Monat Jahr]
```

`/datenschutz/` enthält ebenso keine Anschrift des Verantwortlichen.

Das ist ein laufender Verstoß gegen:

- **§ 25 MedienG** — Geldstrafe bis **€ 20.000** (§ 27 Abs 1 MedienG)
- **§ 5 ECG** — Geldstrafe bis **€ 3.000** (§ 26 Abs 1 ECG)
- **Art. 13 Abs 1 lit. a DSGVO** — Identität des Verantwortlichen

Jeder Push auf `main` deployed das erneut (`.github/workflows/deploy.yml`). Das hat Vorrang vor
allem Weiteren.

**Ebenfalls blockierend:** `src/pages/impressum.astro:7-9` trägt noch
`TODO: confirm this mailbox actually exists`. Wenn `booking@thebumblebees.at` nicht zustellt, ist
§ 5 Abs 1 Z 3 ECG ("rasch und unmittelbar in Verbindung treten") verletzt **und** der in
`datenschutz.astro` dreimal genannte Kanal zur Ausübung der Betroffenenrechte ist tot.

---

## Impressum

### Falscher Begriff — `impressum.astro:70`

Österreich kennt keine "Vereinsregisternummer". Richtig ist die **ZVR-Zahl** (Zentrales
Vereinsregister). Rechtsgrundlage ist **§ 18 Abs 2 VerG 2002**
(*"Die ZVR-Zahl ist von den Vereinen im Rechtsverkehr nach außen zu führen"*), nicht das MedienG.

### Fehlend — `impressum.astro:69`

**§ 5 Abs 1 Z 4 ECG** verlangt *"Firmenbuchnummer **und Firmenbuchgericht**"*. Es ist nur die
Nummer vorgesehen.

### Strukturelle Inkonsistenz — `impressum.astro:29` vs. `65-71`

Als Medieninhaber steht eine natürliche Person, der Block "Unternehmensdaten" bietet aber
Verein/GesbR an. Das muss zusammenpassen:

- **GesbR** → nicht rechtsfähig, Medieninhaber sind die **Gesellschafter**. Diese namentlich nennen
  (zumindest die vertretungsbefugten). Es existiert **keine Registernummer** — diese Zeilen
  streichen. Ein bloßer Bandname genügt nicht.
- **Verein** → Medieninhaber ist der **Verein** (Name + Sitz + ZVR-Zahl), nicht ein Mitglied.
- **Einzelperson** → aktuelle Form passt; Verein- und Firmenbuchzeilen ersatzlos streichen.

### Blattlinie ist nicht erforderlich — `impressum.astro:53-60`

**§ 25 Abs 5 MedienG** nimmt Abs 3 und 4 für die "kleine Website" ausdrücklich aus. Eine
Band-Präsenz (Bandinfo, Terminliste, Booking-Kontakt, kein meinungsbildender Inhalt) ist genau das:
reine *"Präsentation des Medieninhabers"*. Erforderlich sind dann nur **Name/Firma, ggf.
Unternehmensgegenstand, Wohnort/Sitz**.

Die Blattlinie stehen zu lassen schadet nicht (Übererfüllung).

> ⚠️ Sobald ein Blog, eine News-Rubrik oder Kommentare zur Szene dazukommen, wird daraus eine
> "große Website" und Abs 2–4 greifen voll (vertretungsbefugte Organe, Beteiligungen, Blattlinie).

### Telefonnummer ist optional — `impressum.astro:41`

**§ 5 Abs 1 Z 3 ECG** verlangt nur rasche, unmittelbare Kontaktaufnahme. **EuGH C-298/07**
(*deutsche internet versicherung*) stellt klar, dass eine Telefonnummer nicht zwingend ist, wenn
E-Mail plus ein weiterer Kanal existiert. Besser den Platzhalter löschen als eine private
Mobilnummer zu veröffentlichen.

### Berufsrecht-Abschnitt ist zu schwach — `impressum.astro:77-81`

Drei Punkte:

1. **"in der Regel"** gehört nicht in eine Offenlegung. Die eigene Situation nennen, nicht eine
   allgemeine Regel.
2. Der Text stützt sich implizit auf **§ 2 Abs 1 Z 7 i.V.m. Abs 11 GewO** ("eigenschöpferische
   Tätigkeit") — ein *Qualitätstest*, den eine Coverband nicht offensichtlich besteht. Die
   belastbarere Zitierung ist **§ 2 Abs 1 Z 17 GewO**, die *"musikalische Darbietungen"*
   unbedingt vom Anwendungsbereich der GewO ausnimmt. Diese (oder beide) zitieren.
3. ⚠️ **Merchandise-Verkauf** (T-Shirts o. Ä.) über den Selbstverlag der Urheber hinaus kann ein
   Handelsgewerbe sein und ist von **keiner** der beiden Ausnahmen gedeckt.

### Verbraucherstreitbeilegung ist deutsches Boilerplate — `impressum.astro:106-112`

*"Wir sind nicht verpflichtet und nicht bereit…"* ist die Formel aus **§ 36 VSBG (Deutschland)**.
In Österreich gilt das **AStG**; **§ 19 AStG** begründet eine Website-Informationspflicht nur für
Unternehmen, die sich einer AS-Stelle unterworfen haben oder dazu verpflichtet sind. Eine Band, auf
die das nicht zutrifft, muss auf der Website **gar nichts** dazu sagen.

→ **Empfehlung: Abschnitt ersatzlos streichen.**

> ✅ Richtig gelöst: es wird **nicht** auf die EU-ODR-Plattform verlinkt. VO (EU) 524/2013 wurde
> durch VO (EU) 2024/3228 aufgehoben; die Plattform nahm ab 20.03.2025 keine Beschwerden mehr an
> und wurde am 20.07.2025 eingestellt. **Diesen Link niemals nachrüsten.**

### Kleineres

- `impressum.astro:114` — `Stand: August 2026` ist hartcodiert, während `datenschutz.astro:217`
  noch ein Platzhalter ist. Inkonsistent; ein Impressum braucht überhaupt kein Datum.
- `impressum.astro:177` — die CSS-Klasse `.note` wird nirgends verwendet (toter Code).
- `impressum.astro:97-103` — der Link-Haftungsausschluss ist weitgehend wirkungslos; §§ 16–17 ECG
  regeln die Haftung ohnehin. Unschädlich, aber nicht belastbar.
- `impressum.astro:68` — UID-Nummer "falls vorhanden" ist korrekt (§ 5 Abs 1 Z 7 ECG).

---

## Datenschutzerklärung

### 🔴 Drittlandtransfer ohne Rechtsgrundlage — Art. 13 Abs 1 lit. f DSGVO

Die größte inhaltliche Lücke. Es steht, GitHub und Google *"kann Daten auch in den USA
verarbeiten"* (`datenschutz.astro:56-63`, `108-113`) — aber weder der Mechanismus nach Art. 45/46
DSGVO noch die Möglichkeit, eine Kopie der Garantien zu erhalten, wird genannt.

Beide Empfänger sind abgedeckt — das gehört auf die Seite:

- **GitHub**: zertifiziert unter dem **EU-U.S. Data Privacy Framework**
  (Angemessenheitsbeschluss der EU-Kommission vom 10.07.2023), zusätzlich
  **Standardvertragsklauseln** (Durchführungsbeschluss (EU) 2021/914).
- **Google LLC**: ebenfalls DPF-zertifiziert, zusätzlich Standardvertragsklauseln.

### 🔴 Keine Speicherdauer — Art. 13 Abs 2 lit. a DSGVO

Weder für die Hosting-Logs (`datenschutz.astro:38-64`) noch für die Reichweitenmessung
(`75-99`) wird eine Speicherdauer oder ein Kriterium für deren Festlegung genannt. Nur der
E-Mail-Abschnitt (`144-146`) streift das, und das nur vage.

### 🔴 Widerspruchsrecht ist zu versteckt — Art. 21 Abs 4 DSGVO

Zwei Verarbeitungen laufen über Art. 6 Abs 1 lit. f. Damit muss auf das Widerspruchsrecht
*"in einer verständlichen und von allen anderen Informationen getrennten Form"* hingewiesen
werden. Ein Listenpunkt in `datenschutz.astro:196` genügt dafür nicht — es braucht einen eigenen,
optisch abgesetzten Block.

### Fehlende Art.-13-Pflichtangaben

Alle drei sind billig nachzurüsten:

- **Art. 13 Abs 2 lit. f** — Hinweis, dass **keine automatisierte Entscheidungsfindung
  einschließlich Profiling** stattfindet.
- **Art. 13 Abs 2 lit. c** — dass der Widerruf der Einwilligung **mit Wirkung für die Zukunft**
  erfolgt und die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung unberührt lässt.
- **Art. 13 Abs 2 lit. e** — ob die Bereitstellung der Daten erforderlich ist und welche Folgen
  die Nichtbereitstellung hat (relevant für die E-Mail-Kontaktaufnahme).

### Der eigene Code verweist auf eine Aussage, die es nicht gibt

`src/components/VideoSection.astro:80` sagt:
*"The choice is not remembered — see /datenschutz/"*.

Die Datenschutzerklärung sagt **nirgends**, dass die Einwilligung nicht gespeichert wird. Genau
das macht aber "Seite neu laden = widerrufen" (`datenschutz.astro:120-121`) erst zutreffend. Die
Aussage gehört auf die Seite.

### YouTube — weitere Lücken (`datenschutz.astro:101-129`)

- **§ 165 Abs 3 TKG 2021** wird nicht erwähnt. Das Laden des Players erlaubt Google, Informationen
  auf dem Endgerät zu speichern; die Einwilligung deckt DSGVO **und** TKG ab — das sollte dastehen.
- Es wird die datenschutzfreundliche Domain **`youtube-nocookie.com`** verwendet
  (`VideoSection.astro:21`), aber nicht erwähnt. Ein Pluspunkt, der ungenutzt bleibt.
- **Gemeinsame Verantwortlichkeit** für den Übermittlungsvorgang (Art. 26 DSGVO,
  EuGH C-40/17 *Fashion ID*) wird nicht adressiert. Optional, aber üblich.

### Angaben zu Simple Analytics vermutlich falsch — `datenschutz.astro:78-79`

Genannt wird *"Simple Analytics B.V., Amsterdam, Niederlande"*. Die eigene Datenschutzerklärung des
Anbieters beschreibt hingegen ein **Einzelunternehmen (eenmanszaak), Hooftlaan 4, 1401 ED Bussum,
KvK 60978856**. Prüfen und korrigieren — Art. 13 Abs 1 lit. e verlangt eine zutreffende
Bezeichnung des Empfängers samt vollständiger Anschrift.

### Datenkategorien von Simple Analytics unvollständig — `datenschutz.astro:84-88`

Laut Anbieterdokumentation werden zusätzlich erfasst:

- **UTM-Parameter** (`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`)
- **Verweildauer** auf der Seite
- **Scrolltiefe** (in 5%-Schritten)
- **Land** — abgeleitet aus der **Zeitzone**, nicht aus der IP-Adresse
- **Sprache/Region** des Geräts
- nicht-persistente Datenpunkt-, Seiten- und Session-IDs, die beim Neuladen zurückgesetzt werden

Zwei Fakten, die **für** euch sprechen und bisher fehlen: die Server stehen in den **Niederlanden**
ohne Drittlandübermittlung, und die IP-Adresse wird bereits **beim Empfang verworfen** — nicht
bloß "nicht gespeichert".

### GitHub: EEA-Niederlassung fehlt — `datenschutz.astro:41-43`

Für Besucher aus dem EWR ist die maßgebliche Niederlassung **GitHub B.V., Prins Bernhardplein 200,
1097 JB Amsterdam, Niederlande**. Diese neben GitHub, Inc. nennen.

Außerdem: Bei GitHub Pages habt ihr **keinerlei Zugriff** auf diese Server-Logs. Das
dazuzuschreiben ist genauer als die aktuelle Formulierung.

### Personenbezogene Daten der Bandmitglieder fehlen völlig

`src/data/members.ts:22-30` veröffentlicht **Klarnamen, Instrument und Porträtfoto von sieben
realen Personen**. Der Abschnitt "Fotos und Videos" (`datenschutz.astro:162-184`) deckt nur
Bildnisse ab.

→ Eigenen Abschnitt ergänzen: Veröffentlichung von Namen und Funktion der Bandmitglieder,
Rechtsgrundlage **Einwilligung (Art. 6 Abs 1 lit. a DSGVO)**, Hinweis, dass die Mitglieder nach
Art. 13 informiert wurden.

### Auftragsverarbeitungsverträge — Art. 28 DSGVO

Mit **GitHub** und **Simple Analytics** sind AV-Verträge erforderlich. Keine inhaltliche
Anforderung an die Seite, aber eine echte Compliance-Lücke. Simple Analytics bietet eine DPA an;
die von GitHub ist Teil der Nutzungsbedingungen.

Ebenso zu klären: der **E-Mail-Anbieter** (`datenschutz.astro:148-149`, noch Platzhalter) ist
Empfänger bzw. Auftragsverarbeiter — inkl. Drittlandfrage, falls es Google Workspace oder
Microsoft 365 ist.

### Die Cookie-Banner-Analyse ist richtig

`src/layouts/BaseLayout.astro:133-149`: keine Cookies, nichts auf dem Endgerät gespeichert ⇒
**§ 165 Abs 3 TKG 2021 wird nicht ausgelöst**, kein Consent-Banner nötig. Das ist die herrschende
österreichische Praxis.

> ⚠️ **Gegenposition zur Kenntnis:** Die **EDPB Guidelines 2/2023** zum technischen Anwendungsbereich
> von Art. 5 Abs 3 ePrivacy (Endfassung Oktober 2024) sehen Speicherung und Zugriff als
> *alternative* Voraussetzungen und ordnen auch reines IP-basiertes Tracking Art. 5 Abs 3 zu.
> Da Simple Analytics die IP vollständig verwirft und das Land aus der Zeitzone ableitet, steht ihr
> gut da — die Faustregel "kein Cookie ⇒ keine Einwilligung" ist aber allgemein nicht risikofrei.

### Inhaltlich korrekt (keine Änderung nötig)

- § 78 UrhG als Grundlage des Bildnisschutzes ✅
- Anschrift der Datenschutzbehörde: Barichgasse 40–42, 1030 Wien ✅
- Aussage zu Schriftarten und Bildern ✅ (gegen `global.css` verifiziert)
- Social-Media-Links als reine Verlinkung ✅ (gegen `SiteFooter.astro` verifiziert)
- Aufteilung Art. 6 Abs 1 lit. b / lit. f bei E-Mail-Anfragen ✅
- Betroffenenrechte-Katalog und Beschwerderecht ✅

---

## Praktischer Hinweis zur Adresse

Ist der Medieninhaber eine Privatperson, wird auf beiden Seiten eine **Wohnadresse**
veröffentlicht: § 5 Abs 1 Z 2 ECG verlangt eine *geografische Anschrift* und schließt ein Postfach
ausdrücklich aus. (§ 25 MedienG selbst verlangt nur *Wohnort oder Sitz*, also die Gemeinde — die
Straßenadresse kommt aus dem ECG.) Der übliche Weg, das zu vermeiden, ist die Konstituierung als
**Verein** mit einer Vereinssitz-Adresse.

---

## Reihenfolge der Abarbeitung

1. **Sofort** — Platzhalter füllen oder die Seiten offline nehmen (§ 25 MedienG / § 5 ECG laufen).
2. **Sofort** — prüfen, ob `booking@thebumblebees.at` tatsächlich zustellt.
3. **Rechtsform festlegen** — davon hängt ab, wer Medieninhaber ist und welche Registerzeilen
   überhaupt bleiben.
4. **Textänderungen** — Drittlandgarantien, Speicherdauern, hervorgehobenes Widerspruchsrecht,
   fehlende Art.-13-Angaben, Bandmitglieder-Abschnitt, ZVR-Zahl/Firmenbuchgericht,
   Berufsrecht-Formulierung, Streichung der Verbraucherstreitbeilegung.
5. **Danach** — AV-Verträge mit GitHub und Simple Analytics abschließen, E-Mail-Anbieter eintragen.

---

## Quellen

- § 25, § 27 MedienG — <https://www.jusline.at/gesetz/medieng/paragraf/25>
- § 5, § 26 ECG — <https://www.jusline.at/gesetz/ecg/paragraf/5>
- § 18 Abs 2 VerG 2002 — <https://www.jusline.at/gesetz/verg/paragraf/18>
- § 2 GewO 1994 — <https://www.jusline.at/gesetz/gewo/paragraf/2>
- WKO, Informationspflichten nach dem Mediengesetz für Websites —
  <https://www.wko.at/internetrecht/informationspflichten-nach-dem-mediengesetz-fuer-websites>
- WKO, Website-Impressum für Vereine —
  <https://www.wko.at/internetrecht/das-korrekte-website-impressum-fuer-vereine>
- WKO, Alternative Streitbeilegung (ODR-VO aufgehoben) —
  <https://www.wko.at/internetrecht/alternative-streitbeilegung>
- USP.gv.at, Offenlegungspflicht gemäß § 25 MedienG —
  <https://www.usp.gv.at/themen/brancheninformationen/information-und-kommunikation/offenlegungspflicht-gemaess-para-25-mediengesetz.html>
- EDPB Guidelines 2/2023 (Art. 5 Abs 3 ePrivacy) —
  <https://www.edpb.europa.eu/system/files/2024-10/edpb_guidelines_202302_technical_scope_art_53_eprivacydirective_v2_en_0.pdf>
- GitHub General Privacy Statement (EEA-Entity, DPF, SCC) —
  <https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement>
- Google, Data Transfer Frameworks — <https://policies.google.com/privacy/frameworks>
- Simple Analytics, What we collect — <https://docs.simpleanalytics.com/what-we-collect>
- Simple Analytics, Privacy Policy — <https://www.simpleanalytics.com/privacy-policy>
