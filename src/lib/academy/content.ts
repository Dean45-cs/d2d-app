/**
 * Inhalte der Akademie: Verhaltensstandards fuer den Vertrieb an der Haustuer.
 *
 * Bewusst als Daten im Code statt in der Datenbank - die Texte sind
 * redaktionell (und rechtlich) gepflegt, nicht von jedem aenderbar. Jede
 * Regel sagt, woher sie kommt: aus dem Gesetz ("law", mit Fundstelle) oder
 * aus unseren eigenen Standards ("house"). Hausregeln legt die
 * Geschaeftsfuehrung fest und darf sie hier anpassen.
 *
 * ENTWURF: Die Texte ersetzen keine Rechtsberatung. Vor dem Ausrollen
 * rechtlich pruefen lassen (docs/AKADEMIE.md).
 *
 * Aendert sich ein Modul wesentlich (neue Regel, andere Fragen), wird seine
 * version hochgezaehlt - dann muss es jeder neu bestehen. Tippfehler
 * korrigieren braucht keine neue Version.
 *
 * Die Loesungen (answer, explanation) bleiben auf dem Server: an den Browser
 * geht nur publicQuiz() aus score.ts.
 */

/** Woher eine Regel kommt. */
export type RuleBasis = "law" | "house";

export type Rule =
  | {
      /** do: so machen wir es. dont: das passiert nie. */
      kind: "do" | "dont";
      text: string;
      basis: RuleBasis;
      /** Fundstelle, nur bei Gesetz - etwa "§ 312g BGB". */
      ref?: string;
    }
  | {
      /** Gut zu wissen - eine Tatsache, keine Verhaltensregel. */
      kind: "info";
      text: string;
      basis?: RuleBasis;
      ref?: string;
    };

/** Ein Satz an der Tuer: so nicht - so geht's. */
export interface Example {
  situation: string;
  wrong: string;
  right: string;
}

export interface Lesson {
  title: string;
  text: string;
  rules: Rule[];
  example?: Example;
}

export interface Question {
  /** Fest, damit Auswertungen ueber Textkorrekturen hinweg stimmen. */
  id: string;
  text: string;
  options: string[];
  /** Index der richtigen Antwort in options. */
  answer: number;
  /** Warum - steht nach der Antwort, richtig oder falsch. */
  explanation: string;
}

/** Zeichen je Modul (src/components/academy/ModuleIcon.tsx). */
export type ModuleIcon = "person" | "chat" | "ban" | "pencil" | "key" | "shield";

/** Die Symboltoene aus brand.css (wie SymbolTone in components/ui.tsx). */
export type ModuleTone = "blue" | "indigo" | "purple" | "magenta" | "teal" | "slate" | "brown";

export interface AcademyModule {
  /** Teil der Adresse: /akademie/<id>. */
  id: string;
  version: number;
  title: string;
  summary: string;
  /** Lesezeit samt Quiz, grob. */
  minutes: number;
  icon: ModuleIcon;
  tone: ModuleTone;
  /** Das Wichtigste in drei Saetzen - unter dem Video und am Ende des Videos. */
  keyPoints: string[];
  lessons: Lesson[];
  quiz: Question[];
}

/** Ab so viel Prozent richtiger Antworten ist ein Modul bestanden. */
export const PASS_PERCENT = 80;

/** Was immer gilt - auf der Startseite der Akademie. */
export const RED_LINES: Array<{ text: string; basis: RuleBasis; ref?: string }> = [
  { text: "Nie als Stadtwerke, Grundversorger, Netzbetreiber oder Behörde auftreten.", basis: "law", ref: "§ 5 UWG" },
  { text: "Wer gehen soll, geht sofort. Ein Nein ist ein Nein.", basis: "law", ref: "§ 123 StGB" },
  {
    text: "Keine Verträge mit Minderjährigen oder Menschen, die nicht verstehen, was sie unterschreiben.",
    basis: "law",
    ref: "§§ 106 ff. BGB, § 4a UWG",
  },
  { text: "Nie für jemand anderen unterschreiben, nie Daten erfinden.", basis: "law", ref: "§ 267 StGB" },
  { text: "Kein Druck, keine erfundenen Fristen, keine falschen Versprechen.", basis: "law", ref: "§§ 4a, 5 UWG" },
  { text: "Immer über das Widerrufsrecht belehren – mit Formular.", basis: "law", ref: "§§ 312g, 355 BGB" },
  { text: "Kein Klingeln an Sonn- und Feiertagen.", basis: "law", ref: "§ 55e GewO" },
  { text: "Keine Werbeanrufe ohne ausdrückliche Einwilligung.", basis: "law", ref: "§ 7 UWG" },
  { text: "Kundendaten nie in private Chats oder Screenshots.", basis: "law", ref: "DSGVO" },
  { text: "Kein Bargeld, keine Bankkarten, keine PINs oder TANs annehmen.", basis: "house" },
];

export const ACADEMY_MODULES: AcademyModule[] = [
  {
    id: "auftreten",
    version: 1,
    title: "Auftreten & erster Eindruck",
    summary: "Wie du dich vorstellst, wann du klingelst und wo die Tür zur Grenze wird.",
    minutes: 6,
    icon: "person",
    tone: "blue",
    keyPoints: [
      "Ausweis zeigen, Namen und Firma nennen, das Anliegen sagen.",
      "Abstand halten: hinein nur auf Einladung, hinaus sofort, wenn du gehen sollst.",
      "Geklingelt wird Mo–Sa von 10 bis 20 Uhr, nie an Sonn- und Feiertagen – und nur im eigenen Gebiet.",
    ],
    lessons: [
      {
        title: "Die ersten zehn Sekunden",
        text: "An der Tür entscheidet sich in wenigen Sekunden, ob dir jemand zuhört. Ein gepflegtes Auftreten und eine klare Vorstellung schaffen Vertrauen – und schützen dich und die Firma vor Missverständnissen.",
        rules: [
          { kind: "do", basis: "house", text: "Trag den Firmenausweis sichtbar und zeig ihn, ohne dass jemand danach fragen muss." },
          {
            kind: "do",
            basis: "house",
            text: "Stell dich mit Vor- und Nachnamen und dem Namen der Firma vor – und sag gleich, worum es geht: Strom und Gas.",
          },
          { kind: "do", basis: "house", text: "Ordentliche Kleidung. Sonnenbrille ab, Kopfhörer raus, Handy in die Tasche." },
          { kind: "dont", basis: "house", text: "Nicht rauchen, nicht essen, kein Kaugummi an der Tür." },
          { kind: "dont", basis: "house", text: "Kein Alkohol und keine Drogen vor oder während der Arbeit – null Toleranz." },
        ],
        example: {
          situation: "Die Tür geht auf.",
          wrong: "„Hi, haben Sie kurz Zeit? Geht ganz schnell.“",
          right:
            "„Guten Tag, mein Name ist Lena Schmidt von Carlsson Sales – hier ist mein Ausweis. Ich bin heute in Ihrer Straße unterwegs und zeige den Nachbarn, ob sie bei Strom und Gas sparen können.“",
        },
      },
      {
        title: "Abstand und Wohnung",
        text: "Die Haustür ist die Grenze zur Privatsphäre. Wer drängelt, verliert – und riskiert mehr als den Abschluss.",
        rules: [
          { kind: "do", basis: "house", text: "Nach dem Klingeln einen Schritt zurücktreten und eine Armlänge Abstand halten." },
          {
            kind: "do",
            basis: "house",
            text: "Die Wohnung nur betreten, wenn du ausdrücklich hereingebeten wirst – und nur, wenn du dich dabei sicher fühlst.",
          },
          { kind: "dont", basis: "house", text: "Nie den Fuß in die Tür stellen, nie ungefragt eintreten." },
          {
            kind: "dont",
            basis: "law",
            ref: "§ 123 StGB",
            text: "Wirst du gebeten zu gehen, gehst du sofort – auch aus dem Treppenhaus oder vom Grundstück. Wer bleibt, begeht Hausfriedensbruch.",
          },
        ],
      },
      {
        title: "Wann und wo du klingelst",
        text: "Wer zur falschen Zeit oder am falschen Ort klingelt, stört – und sorgt für Beschwerden, die das ganze Team treffen.",
        rules: [
          { kind: "do", basis: "house", text: "Geklingelt wird Montag bis Samstag zwischen 10 und 20 Uhr." },
          {
            kind: "dont",
            basis: "law",
            ref: "§ 55e GewO",
            text: "An Sonn- und Feiertagen wird nicht an der Haustür geworben.",
          },
          { kind: "do", basis: "house", text: "Arbeite nur in deinem zugeteilten Gebiet – fremde Gebiete gehören Kollegen." },
          {
            kind: "do",
            basis: "house",
            text: "Trag jede Tür in der App ein. So klingelt niemand doppelt, und Sperren gelten fürs ganze Team.",
          },
          {
            kind: "do",
            basis: "law",
            ref: "§§ 55, 60c GewO",
            text: "Führe deine Reisegewerbekarte oder die Zweitschrift der Firma mit und zeig sie Polizei oder Ordnungsamt auf Verlangen. Was für dich gilt, sagt dir die Leitung – ohne gültige Papiere gehst du nicht los.",
          },
        ],
      },
    ],
    quiz: [
      {
        id: "auftreten-vorstellen",
        text: "Wie stellst du dich an der Tür richtig vor?",
        options: [
          "Nur mit dem Vornamen – das wirkt persönlicher.",
          "Mit Vor- und Nachnamen, Firma und Anliegen – den Ausweis in der Hand.",
          "Gar nicht – erst einmal fragen, wie hoch die Stromrechnung ist.",
        ],
        answer: 1,
        explanation:
          "Name, Firma und Anliegen gleich zu Beginn schaffen Vertrauen. Wer verschweigt, wer er ist, wirkt unseriös – und erweckt schnell den Eindruck, von einem anderen Unternehmen zu kommen.",
      },
      {
        id: "auftreten-sonntag",
        text: "Sonntag, 14 Uhr, die Sonne scheint, viele sind zu Hause. Was gilt?",
        options: [
          "Perfekte Zeit – sonntags trifft man die meisten.",
          "Klingeln ist okay, solange du nicht länger als fünf Minuten bleibst.",
          "Kein Türgeschäft an Sonn- und Feiertagen.",
        ],
        answer: 2,
        explanation:
          "Sonn- und Feiertage sind tabu. Das ist nicht nur unsere Hausregel: An diesen Tagen ist das Werben an der Haustür gesetzlich verboten.",
      },
      {
        id: "auftreten-wohnung",
        text: "Die Kundin sagt: „Kommen Sie doch kurz rein, ich hole die Rechnung.“ Du fühlst dich unwohl. Was tust du?",
        options: [
          "Reingehen – sonst ist der Abschluss weg.",
          "Freundlich sagen, dass du gern an der Tür wartest.",
          "Reingehen, aber die Tür offen lassen.",
        ],
        answer: 1,
        explanation:
          "Hinein gehst du nur auf Einladung – und nur, wenn du dich sicher fühlst. An der Tür zu warten ist immer in Ordnung und wird fast nie übel genommen.",
      },
      {
        id: "auftreten-gehen",
        text: "Ein Mann ruft: „Verschwinden Sie von meinem Grundstück!“ Du stehst noch im Vorgarten. Was ist richtig?",
        options: [
          "Noch kurz das Angebot erklären – vielleicht hört er dann zu.",
          "Sofort freundlich verabschieden und gehen.",
          "Fragen, ob du nächste Woche wiederkommen darfst, und dann gehen.",
        ],
        answer: 1,
        explanation:
          "Wer zum Gehen aufgefordert wird, geht – sofort. Wer bleibt, begeht Hausfriedensbruch. Sperr die Tür danach in der App, damit auch kein Kollege mehr klingelt.",
      },
      {
        id: "auftreten-gebiet",
        text: "Im Gebiet einer Kollegin sind heute viele zu Hause. Darfst du dort klingeln?",
        options: [
          "Ja, wer zuerst kommt, mahlt zuerst.",
          "Nein – nur im eigenen, zugeteilten Gebiet. Brauchst du mehr Türen, fragst du die Leitung.",
          "Ja, solange du die Türen nicht in der App einträgst.",
        ],
        answer: 1,
        explanation:
          "Gebiete sind zugeteilt, damit niemand doppelt klingelt und Kunden nicht genervt werden. Brauchst du mehr Türen, sprich mit der Leitung.",
      },
      {
        id: "auftreten-papiere",
        text: "Das Ordnungsamt spricht dich an und möchte deine Papiere sehen. Was tust du?",
        options: [
          "Ruhig bleiben, Ausweis und Reisegewerbekarte (oder Zweitschrift) zeigen und die Leitung informieren.",
          "Sagen, dass du nur Flyer verteilst.",
          "Weitergehen – du musst nichts zeigen.",
        ],
        answer: 0,
        explanation:
          "Die Behörde darf die Papiere sehen, und du musst sie dabeihaben. Bleib freundlich, zeig alles vor und gib der Leitung Bescheid.",
      },
    ],
  },
  {
    id: "ehrlichkeit",
    version: 1,
    title: "Ehrlich verkaufen",
    summary: "Was du sagen darfst und was nie: keine falsche Identität, keine erfundenen Pflichten, keine leeren Versprechen.",
    minutes: 7,
    icon: "chat",
    tone: "teal",
    keyPoints: [
      "Sag immer klar, wer du bist – nie „von den Stadtwerken“.",
      "Keine erfundenen Pflichten, Fristen oder Ersparnisse: Bonus und Bedingungen immer dazusagen.",
      "Ein Auftrag heißt Auftrag – nie eine getarnte Unterschrift.",
    ],
    lessons: [
      {
        title: "Wer du bist",
        text: "Die häufigste Beschwerde über Haustürvertrieb: Jemand gibt sich als Stadtwerke oder Netzbetreiber aus. Das zerstört Vertrauen, ist verboten – und der Kunde kann einen so erschlichenen Vertrag anfechten.",
        rules: [
          {
            kind: "dont",
            basis: "law",
            ref: "§ 5 UWG",
            text: "Gib dich nie als Stadtwerke, Grundversorger, Netzbetreiber, Zählerableser oder Behörde aus – auch nicht durch Andeutungen wie „Ich komme wegen Ihres Zählers“.",
          },
          {
            kind: "do",
            basis: "law",
            ref: "UWG",
            text: "Sag klar, für wen du unterwegs bist: Carlsson Sales, Vertriebspartner für Strom und Gas – und von welchem Anbieter der Tarif ist.",
          },
          {
            kind: "dont",
            basis: "law",
            ref: "§ 5 UWG",
            text: "Nie behaupten, ein Wechsel sei Pflicht, der alte Vertrag laufe automatisch aus oder der Kunde müsse unterschreiben, um seinen Strom zu behalten.",
          },
        ],
        example: {
          situation: "Die Kundin fragt: „Sind Sie von den Stadtwerken?“",
          wrong: "„So ähnlich – wir arbeiten mit denen zusammen.“",
          right:
            "„Nein, ich bin von Carlsson Sales, einem Vertriebspartner für Strom und Gas. Ich zeige Ihnen gern, was Sie im Vergleich zu Ihrem jetzigen Tarif zahlen würden.“",
        },
      },
      {
        title: "Was du versprichst",
        text: "Ein Abschluss, der auf schöngerechneten Zahlen beruht, kommt als Widerruf, Beschwerde oder Storno zurück – und kostet am Ende Provision und Ruf.",
        rules: [
          {
            kind: "do",
            basis: "house",
            text: "Rechne mit dem echten Jahresverbrauch aus der letzten Abrechnung – im Tarifvergleich der App.",
          },
          {
            kind: "dont",
            basis: "law",
            ref: "§ 5 UWG",
            text: "Keine Ersparnis versprechen, die nicht sicher ist. Bonus und Preisgarantie immer mit ihren Bedingungen nennen.",
          },
          {
            kind: "dont",
            basis: "law",
            ref: "§ 4 UWG",
            text: "Nichts Unwahres oder Abwertendes über andere Anbieter erzählen.",
          },
          {
            kind: "dont",
            basis: "house",
            text: "Keine Geschenke, Gutscheine oder Prämien versprechen, die es nicht gibt – und keine, die du selbst bezahlen willst.",
          },
        ],
      },
      {
        title: "Fragen ehrlich beantworten",
        text: "Du musst nicht alles wissen. Aber du darfst nichts erfinden.",
        rules: [
          {
            kind: "do",
            basis: "house",
            text: "Weißt du etwas nicht, sag: „Das kläre ich und melde mich“ – und tu es.",
          },
          {
            kind: "do",
            basis: "house",
            text: "Nenne Nachteile genauso offen wie Vorteile – etwa eine lange Laufzeit oder einen Bonus, der erst nach einem Jahr kommt.",
          },
          {
            kind: "dont",
            basis: "law",
            ref: "§ 5 UWG",
            text: "Nie eine Unterschrift als „Besuchsbestätigung“, „Infoanforderung“ oder „Umfrage“ ausgeben. Eine Unterschrift unter einen Auftrag ist ein Auftrag – und wird auch so genannt.",
          },
        ],
      },
    ],
    quiz: [
      {
        id: "ehrlich-stadtwerke",
        text: "Ein Kunde fragt: „Kommen Sie von den Stadtwerken?“ Du bist von Carlsson Sales. Was sagst du?",
        options: [
          "„So in der Art.“",
          "„Nein, ich bin von Carlsson Sales, einem Vertriebspartner für Strom und Gas.“",
          "Nichts dazu sagen und das Thema wechseln.",
        ],
        answer: 1,
        explanation:
          "Ausweichen oder Andeuten zählt wie eine falsche Angabe. Sag klar, wer du bist – Kunden schätzen Ehrlichkeit, und nur so hält der Vertrag.",
      },
      {
        id: "ehrlich-einstieg",
        text: "Welcher Einstieg ist erlaubt?",
        options: [
          "„Ich komme wegen Ihres Stromzählers.“",
          "„Ihr Stromvertrag muss dieses Jahr umgestellt werden.“",
          "„Ich bin heute in der Straße unterwegs und zeige den Nachbarn, ob sie bei Strom und Gas sparen können.“",
        ],
        answer: 2,
        explanation:
          "Die ersten beiden Sätze erwecken den Eindruck, es gehe um eine Pflicht oder eine Ablesung. Das ist irreführend und verboten. Ein ehrlicher Einstieg nennt den wahren Grund.",
      },
      {
        id: "ehrlich-bonus",
        text: "Der Vergleich zeigt 140 € Ersparnis im ersten Jahr, davon 100 € Neukundenbonus. Wie sagst du es richtig?",
        options: [
          "„Sie sparen jedes Jahr 140 €.“",
          "„Im ersten Jahr sparen Sie rund 140 € – 100 € davon sind ein einmaliger Bonus. Danach sind es etwa 40 € im Jahr.“",
          "„Sie sparen garantiert mindestens 140 €.“",
        ],
        answer: 1,
        explanation:
          "Einen Bonus gibt es meist nur einmal. Wer ihn als jährliche Ersparnis verkauft, führt in die Irre – und der Kunde fühlt sich spätestens bei der zweiten Abrechnung betrogen.",
      },
      {
        id: "ehrlich-unterschrift",
        text: "Ein Kollege rät, die Unterschrift als „Bestätigung, dass ich hier war“ auszugeben. Was stimmt?",
        options: [
          "Das ist erlaubt, der Kunde kann ja widerrufen.",
          "Das ist Täuschung. Ein Auftrag wird auch Auftrag genannt.",
          "Das ist in Ordnung, wenn die Leitung zustimmt.",
        ],
        answer: 1,
        explanation:
          "Ein Auftrag muss als Auftrag erkennbar sein. Wer eine Unterschrift erschleicht, täuscht den Kunden – das Widerrufsrecht macht das nicht wieder gut. Solche Tipps gehören zur Leitung.",
      },
      {
        id: "ehrlich-konkurrenz",
        text: "Die Kundin ist bei einem anderen Anbieter. Was darfst du sagen?",
        options: [
          "„Der Anbieter geht bald pleite, wechseln Sie lieber schnell.“",
          "„Bei Ihrem Verbrauch zahlen Sie dort etwa 1.180 € im Jahr, bei diesem Tarif etwa 1.050 € – hier ist die Rechnung.“",
          "„Bei denen gibt es ständig Ärger mit den Abrechnungen.“",
        ],
        answer: 1,
        explanation:
          "Vergleiche mit echten Zahlen sind erlaubt und überzeugen. Gerüchte und Abwertungen über andere Anbieter sind unlauter – und fallen auf dich zurück.",
      },
      {
        id: "ehrlich-wissen",
        text: "Ein Kunde fragt nach einer Vertragsklausel, die du nicht genau kennst. Was tust du?",
        options: [
          "Irgendetwas Plausibles sagen – Hauptsache, das Gespräch läuft weiter.",
          "Ehrlich sagen, dass du es klärst, und dich wie versprochen melden.",
          "Die Frage überhören.",
        ],
        answer: 1,
        explanation:
          "Du musst nicht alles wissen – aber du darfst nichts erfinden. Eine ehrliche Rückmeldung wirkt kompetenter als eine falsche Antwort.",
      },
    ],
  },
  {
    id: "grenzen",
    version: 1,
    title: "Grenzen an der Tür",
    summary: "Wann du nicht klingelst, mit wem du keinen Vertrag machst und warum Nein Nein heißt.",
    minutes: 7,
    icon: "ban",
    tone: "magenta",
    keyPoints: [
      "Ein klares Nein beendet das Gespräch.",
      "Schilder wie „Keine Vertreter“ und gesperrte Türen gelten für alle.",
      "Kein Vertrag mit Minderjährigen oder Überforderten – und nie eine Unterschrift für andere.",
    ],
    lessons: [
      {
        title: "Nein heißt Nein",
        text: "Ein klares Nein beendet das Gespräch. Einen Einwand darfst du einmal freundlich aufgreifen – Druck, Überreden und Wiederkommen gegen den Willen des Kunden nicht.",
        rules: [
          {
            kind: "do",
            basis: "house",
            text: "Einen Einwand wie „Ich habe gerade keine Zeit“ darfst du einmal aufgreifen. Ein klares Nein – „Ich will nicht“, „Bitte gehen Sie“ – beendest du freundlich.",
          },
          {
            kind: "dont",
            basis: "law",
            ref: "§ 4a UWG",
            text: "Kein Druck: nicht bedrängen, nicht laut werden, nicht nachbohren, wenn der Kunde abgelehnt hat.",
          },
          {
            kind: "dont",
            basis: "law",
            ref: "UWG, Anhang",
            text: "Keine erfundenen Fristen wie „Das Angebot gilt nur heute“ oder „Morgen steigen die Preise“.",
          },
          {
            kind: "do",
            basis: "house",
            text: "Wer sagt „Kommen Sie nicht wieder“, wird in der App gesperrt – dann klingelt auch kein Kollege mehr.",
          },
        ],
      },
      {
        title: "Wo du nicht klingelst",
        text: "Manche Türen sind tabu, bevor jemand aufmacht.",
        rules: [
          {
            kind: "dont",
            basis: "law",
            ref: "§ 7 UWG",
            text: "Steht „Keine Vertreter“, „Betteln und Hausieren verboten“ oder Ähnliches an Tür, Klingel oder Tor, klingelst du nicht.",
          },
          {
            kind: "dont",
            basis: "house",
            text: "Auch bei „Bitte keine Werbung“ am Briefkasten klingeln wir nicht – das ist der sichere Weg.",
          },
          {
            kind: "dont",
            basis: "law",
            ref: "§ 123 StGB",
            text: "Verbietet ein Schild am Eingang eines Mehrfamilienhauses Vertretern den Zutritt, gehst du nicht ins Treppenhaus.",
          },
          { kind: "dont", basis: "house", text: "Gesperrte Türen in der App bleiben zu – für alle." },
        ],
      },
      {
        title: "Mit wem du keinen Vertrag machst",
        text: "Ein Vertrag braucht jemanden, der ihn schließen darf und versteht, was er unterschreibt.",
        rules: [
          {
            kind: "dont",
            basis: "law",
            ref: "§§ 106 ff. BGB",
            text: "Keine Verträge mit Minderjährigen. Bei jungen Leuten fragst du nach dem Alter – im Zweifel nach dem Ausweis.",
          },
          {
            kind: "dont",
            basis: "law",
            ref: "§ 4a UWG",
            text: "Keine Verträge mit Menschen, die erkennbar verwirrt, krank, betrunken oder überfordert sind – auch wenn sie unterschreiben würden.",
          },
          {
            kind: "dont",
            basis: "house",
            text: "Versteht jemand nicht genug Deutsch, um den Vertrag zu verstehen, schließt du nicht ab. Biete an wiederzukommen, wenn jemand übersetzen kann.",
          },
          {
            kind: "do",
            basis: "house",
            text: "Unterschreiben darf nur, wer Vertragspartner wird – in der Regel die Person, auf die Strom oder Gas laufen soll.",
          },
          {
            kind: "dont",
            basis: "law",
            ref: "§ 267 StGB",
            text: "Nie für einen Kunden unterschreiben, nie Daten erfinden oder ergänzen, die der Kunde nicht selbst angegeben hat.",
          },
        ],
        example: {
          situation: "Ein Jugendlicher öffnet: „Meine Eltern sind nicht da, aber ich kann das unterschreiben.“",
          wrong: "„Super, dann machen wir das schnell.“",
          right: "„Danke, das ist nett – aber das entscheiden deine Eltern selbst. Wann sind sie denn zu Hause?“",
        },
      },
    ],
    quiz: [
      {
        id: "grenzen-schild",
        text: "An der Haustür hängt „Keine Vertreter“. Was tust du?",
        options: [
          "Trotzdem klingeln – das Schild ist bestimmt alt.",
          "Nicht klingeln und die Tür in der App sperren.",
          "Klingeln, aber nur einen Flyer übergeben.",
        ],
        answer: 1,
        explanation:
          "Ein solches Schild zeigt, dass Werbung an der Tür unerwünscht ist. Wer trotzdem klingelt, handelt unlauter. Mit der Sperre in der App wissen auch die Kollegen Bescheid.",
      },
      {
        id: "grenzen-minderjaehrig",
        text: "Eine 16-Jährige möchte den Vertrag für die Familie unterschreiben. Was gilt?",
        options: [
          "Geht, wenn sie verspricht, es den Eltern zu sagen.",
          "Kein Vertrag – ohne die Eltern kommt mit Minderjährigen kein wirksamer Vertrag zustande.",
          "Geht, wenn sie ihren Schülerausweis zeigt.",
        ],
        answer: 1,
        explanation:
          "Minderjährige können einen Energievertrag nicht wirksam allein schließen. Komm wieder, wenn die Eltern da sind.",
      },
      {
        id: "grenzen-verwirrt",
        text: "Ein älterer Herr wirkt verwirrt und fragt mehrfach, wer du bist, ist aber sofort bereit zu unterschreiben. Was tust du?",
        options: [
          "Schnell abschließen, bevor er es sich anders überlegt.",
          "Nicht abschließen. Freundlich verabschieden – gern mit dem Angebot wiederzukommen, wenn Angehörige dabei sind.",
          "Abschließen und das Widerrufsrecht besonders betonen.",
        ],
        answer: 1,
        explanation:
          "Wer nicht versteht, was er unterschreibt, kann keinen fairen Vertrag schließen. Solche Situationen auszunutzen ist unlauter, der Vertrag womöglich unwirksam – und es ist schlicht nicht unser Stil.",
      },
      {
        id: "grenzen-frist",
        text: "Welcher Satz ist in Ordnung?",
        options: [
          "„Das Angebot gilt nur noch heute“ – obwohl es nächste Woche genauso gilt.",
          "„Der Bonus gilt bis Ende März“ – genau so steht es im Angebot des Anbieters.",
          "„Ohne neuen Vertrag bekommen Sie bald keinen Strom mehr.“",
        ],
        answer: 1,
        explanation:
          "Echte Fristen darfst du nennen. Erfundene Fristen und Drohungen setzen den Kunden unter Druck – das ist verboten.",
      },
      {
        id: "grenzen-nein",
        text: "Die Kundin sagt deutlich: „Nein, ich möchte das nicht. Bitte gehen Sie.“ Was jetzt?",
        options: [
          "Noch drei Gründe nennen, warum sie wechseln sollte.",
          "Freundlich verabschieden, die Tür eintragen und weitergehen.",
          "Ankündigen, dass du morgen noch einmal vorbeikommst.",
        ],
        answer: 1,
        explanation:
          "Ein klares Nein beendest du freundlich. Wer nachbohrt oder ungefragt wiederkommt, belästigt – und hinterlässt einen schlechten Eindruck für das ganze Team.",
      },
      {
        id: "grenzen-unterschrift",
        text: "Der Kunde sagt: „Meine Frau ist nicht da, unterschreiben Sie doch einfach für sie.“ Was tust du?",
        options: [
          "Für sie unterschreiben – er ist ja einverstanden.",
          "Nicht unterschreiben. Du kommst wieder, wenn sie da ist – oder er schließt den Vertrag auf seinen eigenen Namen ab.",
          "Mit ihrem Namen unterschreiben und es ihr später sagen lassen.",
        ],
        answer: 1,
        explanation:
          "Du unterschreibst nie für jemand anderen – das ist Urkundenfälschung. Vertragspartner ist, wer selbst unterschreibt.",
      },
    ],
  },
  {
    id: "vertrag",
    version: 1,
    title: "Vertrag & Widerruf",
    summary: "Was der Kunde wissen und bekommen muss: Preise, Laufzeit, Widerrufsrecht, Unterlagen.",
    minutes: 8,
    icon: "pencil",
    tone: "indigo",
    keyPoints: [
      "Arbeitspreis, Grundpreis, Laufzeit, Preisgarantie und Bonus vollständig erklären.",
      "Vor der Unterschrift: Widerrufsbelehrung mit Formular. Der Kunde hat 14 Tage Widerrufsrecht.",
      "Kein Bargeld, keine Bankkarten, keine PINs oder TANs.",
    ],
    lessons: [
      {
        title: "Den Tarif vollständig erklären",
        text: "Der Kunde soll wissen, was er unterschreibt. Erkläre den Tarif so, dass er ihn seinem Nachbarn erklären könnte.",
        rules: [
          {
            kind: "do",
            basis: "house",
            text: "Arbeitspreis (Cent pro kWh) und Grundpreis (Euro pro Monat oder Jahr) nennen – nicht nur den Abschlag.",
          },
          {
            kind: "do",
            basis: "house",
            text: "Laufzeit, Kündigungsfrist und Preisgarantie erklären – auch, was die Garantie umfasst. Steuern und Abgaben sind oft ausgenommen.",
          },
          { kind: "do", basis: "house", text: "Den Bonus mit seinen Bedingungen nennen, etwa „erst nach zwölf Monaten Belieferung“." },
          {
            kind: "do",
            basis: "house",
            text: "Mit dem Tarifvergleich der App rechnen – und mit dem Verbrauch aus der letzten Abrechnung.",
          },
        ],
      },
      {
        title: "Das Widerrufsrecht",
        text: "Verträge an der Haustür kann der Kunde ohne Begründung widerrufen. Das ist sein gutes Recht – und kein Grund zur Sorge, wenn du ehrlich beraten hast.",
        rules: [
          {
            kind: "info",
            basis: "law",
            ref: "§§ 312g, 355 BGB",
            text: "Der Kunde kann innerhalb von 14 Tagen ohne Angabe von Gründen widerrufen.",
          },
          {
            kind: "do",
            basis: "law",
            ref: "Art. 246a EGBGB",
            text: "Vor der Unterschrift über das Widerrufsrecht belehren und Belehrung samt Widerrufsformular aushändigen – auf Papier oder, wenn der Kunde zustimmt, per E-Mail.",
          },
          {
            kind: "info",
            basis: "law",
            ref: "§ 356 BGB",
            text: "Fehlt die Belehrung oder ist sie falsch, kann der Kunde bis zu zwölf Monate und 14 Tage widerrufen.",
          },
          {
            kind: "dont",
            basis: "house",
            text: "Das Widerrufsrecht nie kleinreden („nur Formsache“) und dem Kunden nie davon abraten.",
          },
        ],
        example: {
          situation: "Die Kundin fragt: „Und wenn ich es mir anders überlege?“",
          wrong: "„Das geht dann leider nicht mehr – unterschrieben ist unterschrieben.“",
          right:
            "„Dann können Sie innerhalb von 14 Tagen ohne Begründung widerrufen. Das Formular dafür bekommen Sie gleich von mir.“",
        },
      },
      {
        title: "Unterlagen und Wechsel",
        text: "Nach der Unterschrift hat der Kunde etwas in der Hand – und weiß, wie es weitergeht.",
        rules: [
          {
            kind: "do",
            basis: "law",
            ref: "§ 312f BGB",
            text: "Der Kunde bekommt zeitnah eine Abschrift oder Bestätigung des Vertrags – auf Papier oder, wenn er zustimmt, per E-Mail.",
          },
          {
            kind: "info",
            basis: "law",
            ref: "§ 41b EnWG",
            text: "Energieverträge mit Haushaltskunden außerhalb der Grundversorgung brauchen die Textform – eine mündliche Zusage reicht nicht.",
          },
          {
            kind: "info",
            text: "Die Kündigung beim bisherigen Anbieter übernimmt in der Regel der neue Anbieter. Achte auf Laufzeit und Kündigungsfrist des alten Vertrags – davon hängt der Lieferbeginn ab.",
          },
          {
            kind: "info",
            basis: "law",
            ref: "§ 38 EnWG",
            text: "Strom und Gas fallen beim Wechsel nicht aus: Klappt etwas nicht, liefert vorübergehend der Grundversorger.",
          },
          {
            kind: "dont",
            basis: "house",
            text: "Kein Bargeld, keine Anzahlungen, keine Bankkarten, PINs oder TANs annehmen – bezahlt wird nur über den Anbieter.",
          },
        ],
      },
    ],
    quiz: [
      {
        id: "vertrag-frist",
        text: "Wie lange kann ein Kunde einen Vertrag von der Haustür widerrufen, wenn er richtig belehrt wurde?",
        options: [
          "Gar nicht – unterschrieben ist unterschrieben.",
          "14 Tage, ohne Begründung.",
          "7 Tage, nur mit Begründung.",
        ],
        answer: 1,
        explanation: "Bei Verträgen außerhalb von Geschäftsräumen hat der Kunde 14 Tage Widerrufsrecht – ohne Begründung.",
      },
      {
        id: "vertrag-belehrung",
        text: "Was passiert, wenn die Widerrufsbelehrung fehlt?",
        options: [
          "Dann gibt es kein Widerrufsrecht.",
          "Die Frist verlängert sich auf bis zu zwölf Monate und 14 Tage.",
          "Der Vertrag gilt sofort und endgültig.",
        ],
        answer: 1,
        explanation:
          "Ohne ordnungsgemäße Belehrung läuft die Frist nicht an – der Kunde kann dann über ein Jahr lang widerrufen. Belehrung und Formular gehören deshalb immer dazu.",
      },
      {
        id: "vertrag-preis",
        text: "Was gehört zu einer vollständigen Preiserklärung?",
        options: [
          "Der monatliche Abschlag – den versteht jeder.",
          "Arbeitspreis, Grundpreis, Laufzeit, Preisgarantie und Bonusbedingungen.",
          "Die Ersparnis im ersten Jahr.",
        ],
        answer: 1,
        explanation:
          "Der Abschlag allein sagt wenig – er hängt vom geschätzten Verbrauch ab. Erst Arbeits- und Grundpreis, Laufzeit, Garantie und Bonusbedingungen ergeben ein ehrliches Bild.",
      },
      {
        id: "vertrag-unterlagen",
        text: "Der Kunde hat unterschrieben. Was gilt für die Unterlagen?",
        options: [
          "Er bekommt nichts – der Anbieter meldet sich irgendwann.",
          "Er bekommt zeitnah eine Abschrift oder Bestätigung des Vertrags. Belehrung und Widerrufsformular hatte er schon vor der Unterschrift.",
          "Er bekommt deine Telefonnummer, das reicht.",
        ],
        answer: 1,
        explanation:
          "Vor der Unterschrift: Widerrufsbelehrung und Formular. Danach: eine Abschrift oder Bestätigung des Vertrags – auf Papier oder, wenn der Kunde zustimmt, per E-Mail.",
      },
      {
        id: "vertrag-kuendigung",
        text: "Die Kundin fragt: „Muss ich meinen alten Vertrag selbst kündigen?“ Was stimmt in der Regel?",
        options: [
          "Ja, sonst zahlt sie doppelt.",
          "Nein, das übernimmt der neue Anbieter für sie.",
          "Ja, und zwar sofort per Einschreiben.",
        ],
        answer: 1,
        explanation:
          "Beim Wechsel kündigt in der Regel der neue Anbieter den alten Vertrag. Achte aber auf Laufzeit und Kündigungsfrist des alten Vertrags – davon hängt ab, wann die Belieferung beginnt.",
      },
      {
        id: "vertrag-bargeld",
        text: "Ein Kunde möchte dir den ersten Abschlag gleich bar mitgeben. Was tust du?",
        options: [
          "Annehmen und eine Quittung schreiben.",
          "Ablehnen – bezahlt wird nur über den Anbieter, nie bar an dich.",
          "Annehmen und an die Leitung weitergeben.",
        ],
        answer: 1,
        explanation:
          "Wir nehmen kein Bargeld, keine Bankkarten und keine PINs oder TANs an. Das schützt den Kunden vor Betrug – und dich vor jedem Verdacht.",
      },
    ],
  },
  {
    id: "datenschutz",
    version: 1,
    title: "Datenschutz & Kontakt",
    summary: "Wie du mit Kundendaten umgehst und wann du Kunden später anrufen oder anschreiben darfst.",
    minutes: 6,
    icon: "key",
    tone: "purple",
    keyPoints: [
      "Nur die Daten aufnehmen, die der Vertrag braucht.",
      "Kundendaten nie in private Chats oder Screenshots.",
      "Anrufe und Werbung per Nachricht nur mit ausdrücklicher Einwilligung.",
    ],
    lessons: [
      {
        title: "Nur was nötig ist",
        text: "Kundendaten sind anvertraut, nicht geschenkt. Du nimmst nur auf, was der Vertrag braucht, und schützt es wie dein eigenes Konto.",
        rules: [
          {
            kind: "do",
            basis: "law",
            ref: "Art. 5 DSGVO",
            text: "Nur die Daten aufnehmen, die der Vertrag braucht – etwa Name, Anschrift, Zählernummer, Verbrauch und Bankverbindung.",
          },
          {
            kind: "dont",
            basis: "law",
            ref: "Art. 5, 32 DSGVO",
            text: "Kundendaten nie in private Chats, WhatsApp-Gruppen oder private Notiz-Apps – und nie als Screenshot.",
          },
          { kind: "do", basis: "house", text: "Handy und Tablet mit Code sperren. Papierunterlagen nie im Auto liegen lassen." },
          {
            kind: "dont",
            basis: "house",
            text: "Keine Fotos von Ausweisen, Rechnungen oder Bankkarten auf dem privaten Handy speichern.",
          },
        ],
      },
      {
        title: "Kontakt nach dem Besuch",
        text: "Ein Gespräch an der Tür ist keine Erlaubnis für Anrufe oder Werbung per Nachricht. Dafür brauchst du ein ausdrückliches Ja.",
        rules: [
          {
            kind: "dont",
            basis: "law",
            ref: "§ 7 UWG",
            text: "Kein Werbeanruf ohne vorherige ausdrückliche Einwilligung des Kunden.",
          },
          {
            kind: "do",
            basis: "law",
            ref: "§ 7a UWG",
            text: "Eine Einwilligung in Telefonwerbung wird dokumentiert und aufbewahrt. Wie das bei uns läuft, sagt dir die Leitung.",
          },
          { kind: "dont", basis: "law", ref: "§ 7 UWG", text: "Keine Werbung per E-Mail, SMS oder WhatsApp ohne Einwilligung." },
          {
            kind: "do",
            basis: "house",
            text: "Vor einer Terminbestätigung per WhatsApp oder SMS fragen: „Darf ich Ihnen den Termin per WhatsApp schicken?“",
          },
          {
            kind: "do",
            basis: "law",
            ref: "Art. 17, 21 DSGVO",
            text: "Will jemand keinen Kontakt mehr oder seine Daten gelöscht haben, gibst du das sofort an die Leitung weiter.",
          },
        ],
        example: {
          situation: "Du hast für einen Termin die Handynummer bekommen.",
          wrong: "Drei Wochen später ungefragt anrufen, um ein neues Angebot zu machen.",
          right: "„Darf ich Sie anrufen, falls sich der Termin verschiebt?“ – und die Nummer nur dafür nutzen.",
        },
      },
    ],
    quiz: [
      {
        id: "daten-chat",
        text: "Ein Kollege bittet dich, ihm die Vertragsdaten eines Kunden schnell per WhatsApp zu schicken. Was tust du?",
        options: [
          "Schicken – er ist ja aus dem Team.",
          "Nicht über einen privaten Chat. Kundendaten bleiben in den dafür vorgesehenen Systemen.",
          "Als Screenshot schicken und danach löschen.",
        ],
        answer: 1,
        explanation:
          "Private Chats und Screenshots sind kein sicherer Ort für Kundendaten. Was der Kollege braucht, sieht er in der App oder bekommt es über die Leitung.",
      },
      {
        id: "daten-anruf",
        text: "Darfst du einen Kunden, mit dem du an der Tür gesprochen hast, später anrufen, um ihm ein Angebot zu machen?",
        options: [
          "Ja, er kennt dich ja schon.",
          "Nur, wenn er vorher ausdrücklich eingewilligt hat und das dokumentiert ist.",
          "Ja, wenn die Nummer im Telefonbuch steht.",
        ],
        answer: 1,
        explanation:
          "Werbeanrufe bei Verbrauchern brauchen eine vorherige ausdrückliche Einwilligung. Ein nettes Gespräch an der Tür ersetzt sie nicht.",
      },
      {
        id: "daten-termin",
        text: "Du willst einen vereinbarten Termin per WhatsApp bestätigen. Was ist der richtige Weg?",
        options: [
          "Einfach schicken – Termin ist Termin.",
          "Kurz fragen, ob der Kunde die Bestätigung per WhatsApp oder SMS möchte.",
          "Die Nummer an alle Kollegen weitergeben, falls jemand einspringen muss.",
        ],
        answer: 1,
        explanation:
          "Mit einem kurzen „Darf ich Ihnen das per WhatsApp schicken?“ bist du auf der sicheren Seite – und der Kunde weiß, von wem die Nachricht kommt.",
      },
      {
        id: "daten-auto",
        text: "Du lässt dein Handy mit der App kurz im Auto. Was muss sein?",
        options: [
          "Nichts – das Auto ist ja abgeschlossen.",
          "Das Handy ist mit Code gesperrt, und keine Unterlagen liegen offen herum.",
          "Abmelden reicht, Papiere sind egal.",
        ],
        answer: 1,
        explanation:
          "Ein ungesperrtes Handy oder offen liegende Verträge sind ein Datenleck. Code-Sperre an – und Unterlagen am besten gar nicht im Auto lassen.",
      },
      {
        id: "daten-loeschen",
        text: "Ein Kunde sagt: „Ich will nicht mehr kontaktiert werden, löschen Sie meine Daten.“ Was tust du?",
        options: [
          "Sagen, dass das nicht geht.",
          "Den Wunsch aufnehmen und sofort an die Leitung weitergeben.",
          "Nichts tun – er vergisst das bestimmt.",
        ],
        answer: 1,
        explanation:
          "Kunden können der Werbung widersprechen und die Löschung ihrer Daten verlangen. Gib den Wunsch sofort weiter, damit er umgesetzt wird.",
      },
      {
        id: "daten-noetig",
        text: "Welche Daten nimmst du für einen Stromvertrag auf?",
        options: [
          "So viele wie möglich – man weiß nie, wofür man sie braucht.",
          "Nur, was der Vertrag braucht – etwa Name, Anschrift, Zählernummer, Verbrauch und Bankverbindung.",
          "Zusätzlich Geburtsdaten und Ausweisnummern aller im Haushalt.",
        ],
        answer: 1,
        explanation:
          "Datensparsamkeit ist Pflicht: nur, was der Vertrag braucht. Alles andere ist ein Risiko für den Kunden und für uns.",
      },
    ],
  },
  {
    id: "sicherheit",
    version: 1,
    title: "Sicherheit & Konflikte",
    summary: "Wie du dich schützt, ruhig bleibst und Beschwerden und Vorfälle richtig weitergibst.",
    minutes: 6,
    icon: "shield",
    tone: "brown",
    keyPoints: [
      "Deine Sicherheit geht vor jedem Abschluss.",
      "Ruhig bleiben, nicht diskutieren, freundlich gehen.",
      "Beschwerden und Vorfälle noch am selben Tag der Leitung melden.",
    ],
    lessons: [
      {
        title: "Deine Sicherheit geht vor",
        text: "Kein Abschluss ist es wert, dass du dich in Gefahr bringst. Wer sich unwohl fühlt, geht – ohne sich rechtfertigen zu müssen.",
        rules: [
          {
            kind: "do",
            basis: "house",
            text: "Fühlst du dich unwohl, verabschiede dich freundlich und geh – auch mitten im Gespräch.",
          },
          {
            kind: "dont",
            basis: "house",
            text: "Kein Grundstück betreten, auf dem ein Hund frei läuft – und keine Wohnung, in der du dich nicht sicher fühlst.",
          },
          {
            kind: "do",
            basis: "house",
            text: "Halte dein Handy geladen und die Leitung erreichbar. Der Energiesparmodus der App hilft über den Tag.",
          },
          { kind: "info", text: "Im Notfall: 112 für Rettungsdienst und Feuerwehr, 110 für die Polizei." },
        ],
      },
      {
        title: "Schwierige Gespräche",
        text: "Manche Menschen sind wütend, bevor du ein Wort gesagt hast. Das ist selten persönlich – aber nie ein Grund, selbst laut zu werden.",
        rules: [
          {
            kind: "do",
            basis: "house",
            text: "Ruhig bleiben, nicht diskutieren, nicht provozieren lassen. Ein freundliches „Schönen Tag noch“ beendet fast jedes Gespräch.",
          },
          { kind: "dont", basis: "house", text: "Nie beleidigen, drohen oder laut werden – auch nicht, wenn das Gegenüber es tut." },
          {
            kind: "dont",
            basis: "house",
            text: "Keine Fotos oder Videos von Kunden, Häusern oder Streit – und nichts davon in sozialen Medien.",
          },
          {
            kind: "do",
            basis: "house",
            text: "Bei Polizei oder Ordnungsamt: freundlich bleiben, Papiere zeigen, sachlich antworten und die Leitung informieren.",
          },
        ],
        example: {
          situation: "Ein Mann ruft dir hinterher: „Ihr Vertreter seid doch alle Betrüger!“",
          wrong: "„Was fällt Ihnen ein? Ich arbeite hier ehrlich!“",
          right: "„Das tut mir leid, wenn Sie schlechte Erfahrungen gemacht haben. Einen schönen Tag noch.“ – und weitergehen.",
        },
      },
      {
        title: "Beschwerden und Vorfälle",
        text: "Eine Beschwerde ist eine Chance, Vertrauen zurückzugewinnen – wenn sie schnell bei der richtigen Person landet.",
        rules: [
          {
            kind: "do",
            basis: "house",
            text: "Zuhören, die Beschwerde ernst nehmen und den Kontakt zur Leitung weitergeben. Nichts versprechen, was du nicht halten kannst.",
          },
          {
            kind: "do",
            basis: "house",
            text: "Jeden Vorfall noch am selben Tag der Leitung melden: Streit, Drohungen, Unfälle, Polizeikontakt, Beschwerden.",
          },
          {
            kind: "do",
            basis: "house",
            text: "Erzählt ein Kunde, ein Kollege habe ihn getäuscht oder bedrängt: nicht verteidigen, aufnehmen und an die Leitung geben.",
          },
          { kind: "dont", basis: "house", text: "Probleme nie vertuschen. Fehler passieren – Verschweigen macht sie schlimmer." },
        ],
      },
    ],
    quiz: [
      {
        id: "sicher-aggressiv",
        text: "Ein Kunde wird mitten im Gespräch aggressiv und kommt dir zu nahe. Was tust du?",
        options: [
          "Weiterreden – du bist fast beim Abschluss.",
          "Das Gespräch freundlich beenden, Abstand gewinnen und gehen. Danach der Leitung Bescheid geben.",
          "Laut werden, damit er merkt, dass du dich nicht einschüchtern lässt.",
        ],
        answer: 1,
        explanation:
          "Deine Sicherheit geht vor jedem Abschluss. Geh, sobald es kippt, und melde den Vorfall – so sind auch Kollegen gewarnt.",
      },
      {
        id: "sicher-hund",
        text: "Hinter dem Gartentor läuft ein großer Hund frei herum. Was tust du?",
        options: [
          "Schnell zur Tür gehen, bevor er dich bemerkt.",
          "Nicht aufs Grundstück gehen – höchstens am Tor klingeln, wenn es dort eine Klingel gibt.",
          "Den Hund mit einem Leckerli ablenken.",
        ],
        answer: 1,
        explanation:
          "Ein frei laufender Hund ist ein klares Stoppsignal. Gibt es am Tor eine Klingel, kannst du dort klingeln – sonst geht es zum nächsten Haus.",
      },
      {
        id: "sicher-beschwerde",
        text: "Eine Kundin beschwert sich, ein Kollege habe ihr letzte Woche erzählt, er sei von den Stadtwerken. Was tust du?",
        options: [
          "Den Kollegen verteidigen – das war bestimmt ein Missverständnis.",
          "Zuhören, dich entschuldigen, die Angaben aufnehmen und an die Leitung weitergeben.",
          "Sagen, dass du damit nichts zu tun hast.",
        ],
        answer: 1,
        explanation:
          "Solche Beschwerden gehören zur Leitung – nur so lässt sich das klären und abstellen. Verteidigen oder Abwimmeln macht es schlimmer.",
      },
      {
        id: "sicher-beschimpft",
        text: "Jemand beschimpft dich an der Tür als Betrüger. Was ist die beste Reaktion?",
        options: [
          "Zurückschimpfen.",
          "Ruhig bleiben, freundlich verabschieden und weitergehen.",
          "Mit dem Handy filmen, um es später zu zeigen.",
        ],
        answer: 1,
        explanation:
          "Ruhe beendet fast jeden Konflikt. Zurückschimpfen oder Filmen heizt die Lage an – und kann selbst rechtliche Folgen haben.",
      },
      {
        id: "sicher-melden",
        text: "Du hattest einen Streit an der Tür, passiert ist aber nichts. Musst du das melden?",
        options: [
          "Nein, es ist ja nichts passiert.",
          "Ja, noch am selben Tag der Leitung – damit sie Bescheid weiß, falls sich jemand beschwert.",
          "Nur, wenn die Polizei kommt.",
        ],
        answer: 1,
        explanation: "Die Leitung muss Bescheid wissen, bevor eine Beschwerde kommt. Ein kurzer Hinweis reicht – und schützt dich.",
      },
      {
        id: "sicher-notfall",
        text: "An einer Tür merkst du, dass jemand gestürzt ist und dringend Hilfe braucht. Was tust du?",
        options: [
          "Die Leitung anrufen – sie entscheidet dann.",
          "Sofort 112 anrufen. Erst helfen, danach der Leitung Bescheid geben.",
          "Weitergehen – das ist nicht deine Aufgabe.",
        ],
        answer: 1,
        explanation:
          "Im Notfall zählt jede Minute: 112 für Rettungsdienst und Feuerwehr, 110 für die Polizei. Danach informierst du die Leitung.",
      },
    ],
  },
];

/** Ein Modul nach seiner Adresse - undefined, wenn es keines gibt. */
export function findModule(id: string): AcademyModule | undefined {
  return ACADEMY_MODULES.find((mod) => mod.id === id);
}

/** Das Modul nach diesem - fuer "Weiter" nach dem Bestehen. */
export function nextModule(id: string): AcademyModule | undefined {
  const index = ACADEMY_MODULES.findIndex((mod) => mod.id === id);
  return index >= 0 ? ACADEMY_MODULES[index + 1] : undefined;
}
