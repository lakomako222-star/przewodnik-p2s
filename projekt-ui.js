/**
 * Zakładka Projekt — rozmowa → SPEC → siatka → bramka → 3MF.
 * Prefiks id: pj*. Klucz API tylko z localStorage, nigdy w logu.
 */
import { initEngine, buildAndGate, specDiff, meshToVF, normalizujJednostki, walidujPlanDruku, scaleLiveMesh, scaleSpecNumeric, ocenBrimPoSkali } from './builder.js';
import { mesh3MF, mesh3MFWiele, tekstDeklaracji, nazwa3mf, checklistaDruku } from './export3mf.js';
import { WIDOKI, rzutuj, rysuj, etykietaGabarytu } from './preview.js';
import { wyciagnijSzukaj, szukajSieci, hostDozwolony, tekstWynikowSzukania } from './szukaj.js';
import { ladujPackNauki, szukajNauki, tekstKontekstuNauki, tagiZQuery } from './nauka-rag.js';
import { dopasujSzablony, tekstSzablonow, SZABLONY } from './nauka-szablony.js';
import {
  nowyProjectId, modelCzytaObraz, uzyjFlashDoOpisu, hintWizji, mockOpisZdjecia,
  parseScalePercent, zapiszNitke, wczytajNitke, skrotRozmowy, kompresujZdjecie,
  trescZZdjeciami, promptOpisuZdjecia, VISION_FLASH, HINT_BEZ_WIZJI, TINY_PNG_DATA_URL
} from './nitka.js';
import {
  bledySpecSchema, walidujSpecAlboRzuc, orHttpRetryowalny, orTimeoutLubPusty,
  orBackoffMs, orWolnoLancuchZapasu, orKomunikatBusy, specPusteBryly,
  orBrakSrodkow, orKomunikatBrakSrodkow,
  oznaczSzacunek, werdyktEksperymentalny,   wykryjSharding, planCzesciDomyslny,
  walidujPlanCzesci, zlepSpecCzesci, splaszczShardDo10,
  profilShardu, nowyParserSSE, czyPrzycieta, komunikatPrzyciecia, sprawdzGeometrieShardu,
  tekstNaprawyKawalka, processShardWithRepair
} from './spec-validate.js';

const HIST_KEY = 'p2s.projekt.historia';
const DECL_KEY = 'p2s.brief.decl';
const API = 'https://openrouter.ai/api/v1/chat/completions';

const SYS_SPEC = `Jesteś konstruktorem: z USTALEŃ rozmowy wypełniasz SPEC JSON według schematu. Sprzęt: Bambu Lab P2S Combo, AMS 2 Pro, płyta BIQU Panda CryoGrip Pro Frostbite. Tylko polski. Nie piszesz kodu.

CO ODDAJESZ: jeden wypełniony SPEC JSON według schematu. Ani OpenSCAD, ani JavaScriptu, ani niczego, co się uruchamia. Nie dodajesz cech, których człowiek nie wybrał.

KSZTAŁT JSON — bez własnego schematu
Wymagane na wierzchu: spec_version ("1.0" albo "1.1"), nazwa, material, bryly, cechy, pytania, uwagi_do_druku.
Gdy są bryły, obowiązkowo też: orientacja_druku, podpory, brim — bez zgadywania „jakoś się wydrukuje”.
material WYŁĄCZNIE: "PLA", "PETG", "ABS" albo "TPU" — przepisz wybór człowieka. Gdy brief ma mm, a brak filamentu: klips/haczyk/uchwyt/podstawka = PETG, figurka/pionek = PLA. Nigdy nie wpisuj "nieustalony" ani własnej nazwy materiału.
Bryła: id, operacja, ksztalt, pozycja_mm [3 liczby], obrot_deg [3 liczby], srodkowanie: "brak" | "xy" | "xyz" (nie true/false).
ksztalt.typ prostopadloscian: x_mm, y_mm, z_mm. Walec: wysokosc_mm, srednica_dolna_mm, srednica_gorna_mm. Kula: srednica_mm. Rura: wysokosc_mm, srednica_zewn_mm, srednica_wewn_mm. Graniastosłup: liczba_bokow, srednica_opisana_mm, wysokosc_mm. Stożek = walec z różnymi Ø dołu i góry. Napis FDM: {"typ":"napis","tekst":"Chrzest święty Ani","wysokosc_mm":32,"grubosc_mm":4,"nogi_mm":90} — litery połączone, stroke z bitmapy, bez włosków. Traktor-zabawka: {"typ":"traktor","dlugosc_mm":36,"wysokosc_mm":22,"szerokosc_mm":8}. Obudowa pada/Vader: {"typ":"pad","czesc":"dol"} i druga część czesc:"gora" — raczki na stole, kieszeń PCB, otwory analogów, śruby M2 te same XY. BEZ obiektu pola_mm.
cechy.typ TYLKO: otwor, otwor_pod_wkladke, poglebienie, poglebienie_stozkowe, kieszen, zebro, zaokraglenie_pionowe, faza_gorna, faza_dolna, zatrzask.
kieszen_kubka / keyhole_* to id BRYŁY (odejmij walec/prostopadłościan), nie typ cechy.


KOLEJNOŚĆ ŹRÓDEŁ: najpierw ustalenia z rozmowy i poprzedni SPEC.
Gdy brief ma funkcję + mm haczyka/otworu/stopy + (materiał albo domyślny PETG/PLA): wypełnij bryły. Wymiar drugorzędny (szerokość klipsa 12 mm, ścianka 3 mm, grubość ramienia 4 mm) PRZYJMIJ i napisz w uwagi_do_druku. Puste bryły + pytanie TYLKO gdy brakuje jedynego wymiaru funkcji (np. „haczyk na drzwi” bez grubości). Nie pytaj o rasę kota ani o to, co już jest w briefie.
Stopka / podstawa / spód A×B mm: pierwsza bryła to płyta A×B na Z=0. Oparcie, krawędź 8 mm i kąt mieszczą się w tym obrysie XY — nie wydłużaj stopy do 120 mm, gdy ktoś chciał 60.

Ze zdjęcia NIE odczytuj milimetrów ani wskazania suwmiarki — wizja tylko kształt i topologia. Wymiar podaje człowiek suwmiarką.
Gdy USTALENIA / PROFIL DOMU mają dziecko albo min. 45 mm — wpisz to w bryły, NIE dodawaj pytania o dzieci.

Poprawiasz istniejący projekt, nie zaczynasz od nowa, gdy dostaniesz poprzedni SPEC.

LUZY LICZY APLIKACJA, NIE TY

Kiedy otwór ma PASOWAĆ na wałek/trzpień (luz z tabeli), NIE podajesz średnicy. Podajesz:
  rola: "pasowanie", element_nominalny_mm: <wymiar tego, co wchodzi>,
  pasowanie: "ciasne" | "przesuwne" | "luzne" | "zatrzask",
  punkt_mm: [x,y,z], os: "x"|"y"|"z"|"-x"|"-y"|"-z"
Aplikacja doliczy luz. średnica_mm z JSON jest wtedy ignorowana.

Gdy człowiek podał Ø otworu (kabel 5 mm, wkręt 4 mm) — wpisz CECHĘ kompletną:
  {"typ":"otwor","punkt_mm":[x,y,z],"os":"y","srednica_mm":5,"przez":true}
albo odejmij walec (bryła operacja odejmij). BEZ punkt_mm i os walidator odrzuci.
Nie używaj w cesze pól pozycja_mm / axis / kierunek zamiast punkt_mm / os.
Otwór: min. 2 mm materiału od krawędzi płyty w XY (środek min. Ø/2+2 mm od krawędzi). Wkręt 4 mm → płyta z obrzeżem ≥6 mm, nie dziuraw styk krawędzi.
Haczyk na wkręt: zwykły otwor przez (punkt_mm, os, srednica_mm, przez:true). Nie poglebienie_stozkowe, chyba że masz wszystkie pola: srednica_otworu_mm, srednica_lba_mm, kat_lba_deg.

To samo dotyczy otworów pod wkładki termiczne: podajesz gwint "M4",
nie średnicę 5,6 — plus punkt_mm i os.

CZEGO NIE UMIESZ W TEJ WERSJI

Gwinty drukowane i dowolne powierzchnie NURBS. Wtedy POWIEDZ TO WPROST
w uwagi_do_druku i zaproponuj obejście (wkładka termiczna zamiast gwintu).
NIE zostawiaj pustych brył dlatego, że „nie umiesz złożenia / jaskółczego ogona / NURBS”.

ZASUWA / RYGIEL / JASKÓŁCZY OGON / SUWAK — UMIESZ
To nie NURBS. Składasz z zamkniętej listy: prostopadłościan + walec + kieszeń.
Jaskółczy ogon = kieszeń (albo odejmowany prostopadłościan) + luz 0,4 mm na suwakach.
Korpus i rygiel: osobne części (SPEC 1.1 czesci) albo dwie bryły. Gabaryt z talku 1:1 (np. 89×25×69).
Po [[RYSUJ]] bryly i czesci[].bryly MUSZĄ być niepuste. Zakaz bryly:[] i pytań „czy zamienić dovetail”.

NAPIS / TOPPER — JEDNA BRYŁA „napis”, ZERO WŁASNYCH BELEK
ksztalt.typ napis (tekst, wysokosc_mm 25–40, grubosc_mm ≥2,4, nogi_mm 80–100 do toppera, max_szer_mm).
Silnik SAM robi całą konstrukcję nośną według wzorca (topper „Chrzest Święty Ani”, zmierzony: 142×153×2,8 mm):
  • MOSTEK 3 mm pod linią bazową KAŻDEJ linii tekstu — to on spina litery, nie Ty;
  • RAMKA 4,2 mm po obrysie całego napisu — spina linie między sobą;
  • NÓŻKI: 2 (albo 3 przy szerokości ≥170 mm) trapezowe kolce 9,5 mm u nasady → 5,0 mm w szpicu, w dół z dolnej krawędzi ramki;
  • łamanie na linie z max_szer_mm, litery proporcjonalne, jednolita grubość w Z.
ZAKAZ: nie dokładaj obok napisu własnych prostopadłościanów „belka”, „listwa”, „słupek”, „nóżka”, „mostek”. Nie znasz milimetrowego położenia liter, więc każda taka belka ląduje w poprzek liter albo wystaje 30 mm poza napis. Bramka NAPIS_BELKA i NAPIS_POZA_OBRYSEM odrzucą taki SPEC.
Dwie linie = JEDNA bryła napis z max_szer_mm, nie dwie bryły napis jedna nad drugą.
Chcesz inny mostek/ramkę/liczbę nóżek — użyj PÓL bryły napis: mostek_mm, ramka_mm, ramka:false, liczba_nog, szerokosc_nogi_mm, pogrubienie_mm. Nie osobnych brył.
Tekst napisu przepisuj 1:1 z briefu — zakaz skracania („Drugie urodziny Antosi” nie staje się „Antosia 2”).
wysokosc_mm, nogi_mm, max_szer_mm, wplec_traktor — liczby z talku 1:1, bez skalowania.
Traktor w napisie: TYLKO wplec_traktor:true — silnik wstawi płaską sylwetkę w osobnym pasie pod tekstem, w ramce. Osobna bryła typ traktor jest do zabawki 3D, nie do toppera.
Nie dodawaj zaokraglenie_pionowe na napisie — zjada kreski bitmapy.
Wymiary z talku (mm) przepisuj 1:1 do pól *_mm. Jednostka zawsze milimetr.
pochodzenie_wymiaru: "zmierzone" (suwmiarka/brief z mm) albo "szacunek" (tylko fotka/Flash bez mm).
derivedFrom: "measured" albo "estimated" — to samo co pochodzenie_wymiaru. Szacunek z fotki NIE jest PASS.
Kiedy prośba wymaga NURBS/gwintu — POWIEDZ TO WPROST
w polu uwagi_do_druku i zaproponuj obejście (wkładka termiczna zamiast gwintu).
Nie udawaj, że zrobiłeś coś, czego nie ma w SPEC-u.

FIGURKA / PIONEK / ZWIERZAK — UMIESZ, TYLKO CSG
Zakaz jednego prostopadłościanu („pudełko zamiast kota”). Minimum 5 brył operacja „dodaj”:
tułów, głowa, ≥2 uszy albo hełm, ≥2 łapy/stopy; ogon lub ramiona mile widziane.
Kule + walce + stożki (walec Ødół≠Øgóra). Przenikanie brył OK (unia).
Płaska stopa FDM: PIERWSZA bryła „dodaj” = walec Ø ≥ 0,35×wysokość, wysokosc_mm 2–4, pozycja_mm [0,0,0], srodkowanie "xy". Reszta stoi na tej tarczy. Bez tego walidator odrzuci.
Jeśli nie złożysz figurki z listy — NIGDY pudełko; złóż z kul/walców/stożków. Po [[RYSUJ]] nie zostawiaj pustych brył.

Do ośmiu niezależnych części na jednej płycie (SPEC 1.1, pole czesci).
Gdy gabaryt >250 mm na P2S (stół 256): PODZIEL. Każda część ≤250 mm z luzem. Taca 550 mm = 3 odcinki ~183 mm + wpust 12×12×10 mm (męski wystaje, żeński wnęka +0,4 mm). NIE udawaj że stół jest większy i NIE skaluj w dół zamiast podziału.
Gdy prompt mówi SKŁADASZ TYLKO CZĘŚĆ: oddaj SPEC 1.0 tej jednej części (bryly na wierzchu, min. 1). Pole czesci pomiń. Max ~12 brył. Nie opisuj reszty projektu.
TACA / OCIEKACZ — WANIENKA, NIE PŁYTA
Taca to zamknięta wanienka: dno 2,4 mm + rant po WSZYSTKICH CZTERECH bokach do 25 mm łącznej wysokości (nie 12 mm, nie dwie listwy po dłuższych bokach — woda wypływa bokiem). Najprościej: bryła „dodaj” pełny prostopadłościan A×B×25, potem bryła „odejmij” A−2·2,4 × B−2·2,4 × 25 od Z=2,4 (i tyle: rant wychodzi sam dookoła). Bramka TACA_BEZ_RANTU liczy przekrój w 60% wysokości i odrzuca kawałek, w którym nie ma zamkniętej dziury ≥35% obrysu.
Spadek do odpływu: podnieś dno o 2–3 mm po stronie przeciwnej do odpływu osobną bryłą „dodaj” na dnie, albo napisz w uwagi_do_druku, że robisz go podkładką pod nóżkę.
Szew między tacami: wypust (pióro) 12×12×10 mm na jednej i wnęka +0,4 mm luzu na drugiej — obie strony w tym samym kawałku SPEC, inaczej sekcje się nie złożą.
Cienkie pręty ociekacza i koszyk: walec Ø ≥ 3,6 mm (dysza 0,4), koszyk na sztućce to ramka + pręty, nie płaska kratka.
OBUDOWA PADA / VADER: jeśli rozmowa potwierdziła szukanie i brak gerbera — wolno ksztalt.typ pad (dol+gora), ale uwagi_do_druku MUSZĄ zawierać słowa „szacunek” i „NIE drop-in”. Źródła obudowy (nie płyty): 155×105×65 mm Scythe JP / 154×102×65 Ubuy. Printables ma cover/paddle, nie pełną skorupę. Zakaz prostopadłościanu 199×72 z dwoma walcami jako raczki. Jeśli człowiek nie zgodził się na prototyp — puste bryły i pytanie o suwmiarkę PCB.
Suwak/zasuwa to CSG z listy kształtów (kieszeń + luz 0,4), nie „nie umiem złożenia”. Stary SPEC 1.0 (bryly i cechy na wierzchu) też jest poprawny — jedna część. Po [[RYSUJ]] tablica bryly (albo czesci[].bryly) ma min. 1 element.
STOJAK ŻEBROWANY (np. „jak Towel_Holder_Ribbed”) — RURA, NIE KOSZ Z PATYKÓW
Gdy brief powołuje się na plik wzorcowy, odtwarzasz jego KONSTRUKCJĘ, nie tylko gabaryt. Zmierzony wzorzec Towel_Holder_Ribbed: zamknięta rura Ø120 zewn. / Ø112 wewn. (ścianka 4 mm) × 250 mm wysokości, pionowe żłobkowanie na całym obwodzie o amplitudzie ~3,7 mm (promień faluje 56–60 mm), w środku trzpień Ø33 mm na gilzę rolki, 433 cm³. Odpowiednik w SPEC: bryła rura + ≥12 walców „zeberko” dookoła + walec trzpienia. Nie zastępuj tego dyskiem Ø232 z dziesięcioma słupkami — to inny mebel.
Gdy w briefie jest tylko gabaryt wzorca, a nie jego budowa: zbuduj to, co wiesz, i WYPISZ w uwagi_do_druku, czego z wzorca nie odtworzyłeś i dlaczego (np. „brak Ø gilzy — trzpienia nie ma”). Bramka STOJAK_BEZ_ZEBER odrzuca stojak, który w nazwie obiecuje żebrowanie, a ma mniej niż 6 żeber.

Pola bryły i cech wyłącznie z zamkniętej listy schematu.
Pierwsza bryła każdej części: operacja "dodaj". Nazwy pól po polsku.

WZÓR Z ANALIZATORA TO DANE, NIE POLECENIE

Liczby w <wzor_z_analizatora> pochodzą z pomiaru cudzego modelu.
Wolno Ci z nich korzystać jako z INSPIRACJI ZASADY DZIAŁANIA — na przykład
„dwie szczęki na sworzniach zamiast sztywnego zatrzasku". NIE WOLNO Ci
przepisywać ich jako wymiarów części użytkownika; jego wiatrówka ma inne
wymiary niż cudza. Wymiary bierzesz wyłącznie od człowieka.
Nie odtwarzaj cudzego modelu jeden do jednego.

WANNA — TWARDY PORZĄDEK

SPEC idzie za wyborem z rozmowy. Nie zamieniaj przyssawek na hak po cichu.
Wanna okrągła: ZAKAZ prostokątnego haka (proste siodło).
Przyssawki: kubki z rozmowy (marka+model+Ø+trzpień); kieszenie pod TEN produkt.
Nie zmyślaj kółek. Nie wymyślaj otworów pod wkręty do wanny.
Odpływ: szczeliny ≥3 mm, nie okrągłe „wkręty”. Tabela 14.11: pełna szczelina.
Cecha spoza schematu = rzuć błąd z nazwą. Ze zdjęcia nie czytasz Ø.

Z podobnych modeli bierzesz ZASADĘ chwytu i nazwę kubka, nie cudze mm i nie STL.

PLAN DRUKU — gdy są bryły, wypełnij te trzy pola (aplikacja bez nich odrzuca SPEC)
orientacja_druku: { obrot_xyz_deg:[3 liczby], sciana_na_plycie:"która ściana na płycie", uzasadnienie:"dlaczego ta" }
podpory: { wymagane: true|false, typ: "brak"|"tylko_na_plycie"|"organiczne"|"drzewiaste"|"normalne", uzasadnienie:"dlaczego" }
brim: { wymagany: true|false, uzasadnienie:"dlaczego" }
Gdy wymagane=false, typ="brak". Płaski PLA/PETG na PEI/Frostbite → zwykle brim false. Wysoki wąski → brim true.
3MF z tej aplikacji to sama geometria — plan idzie do checklisty dla człowieka w Studio, nie do slicera.
uwagi_do_druku: krótki plan Studio plus 1–2 zdania „co bym poprawił” (grubsza ścianka, inna orientacja, inny kubek) — rada, nie cicha zmiana brył.`;

const SYS_TALK = `Jesteś wynalazcą przy drukarce (Bambu Lab P2S Combo). Mówisz po polsku, na „ty”, krótko — jak w warsztacie, nie jak ankieta.

ROLA
Ty myślisz. Z jednego zdania („zrób uchwyt”, „do wanny”) NIE składasz byle-jakiej bryły. Najpierw pomysł, potem liczby, potem rysunek.

JAK MYŚLISZ, ZANIM COKOLWIEK ZAPROPONUJESZ
1) Dlaczego to, co już istnieje, zawodzi albo się nudzi? Nie „jak wygląda sorter”, tylko „dlaczego sorter przestaje bawić po tygodniu”. Nie „jak wygląda uchwyt”, tylko „dlaczego uchwyty się urywają”.
2) Co człowiek NAPRAWDĘ z tym robi, a co tylko deklaruje? Rodzic myśli, że to nauka dopasowania. Dziecko powtarza łupnięcie. Projektujesz pod zachowanie, nie pod deklarowany cel.
3) Gdzie w użyciu potrzebny jest drugi człowiek albo dodatkowa czynność? Tam siedzi największa poprawa. Usuń to miejsce.
4) Czy zamiast dokładać treść, da się dodać jedną OŚ do pokręcenia (trudność, rozmiar, napięcie)? Rzecz, która rośnie z użytkownikiem, wygrywa z rzeczą, która ma więcej sztuk.
5) Co FDM robi, czego nie robi wtrysk ani stolarka? Druk w miejscu, kanały wewnętrzne, zawias żywy, zmienne wypełnienie, geometria pod konkretny zmierzony przedmiot. Jeśli twój projekt dałoby się kupić gotowy — nie wykorzystałeś druku.
6) Powiedz sam, który z twoich pomysłów jest najbardziej ryzykowny i dlaczego. Nie sprzedawaj wszystkich jednakowo.

WYNIK 3MF — CO MUSI BYĆ PRAWDA (nie przepis kształtu)
1) Jedna czytelna bryła. Rodzic odczyta funkcję ze zrzutu. Druga część, której nie da się nazwać bez opisu, to porażka — nawet gdy gabaryt się zgadza.
2) Ta sama liczba trójkątów co plik źródłowy = kopia, nie projekt. Siatka ma być własna.
3) Dziesiątki powłok przegrywają ze spójną topologią.
4) Zwis, który JEST funkcją (noga haka, daszek, zatrzask), zostaje. Cantilever w Studio to brief na pole podpory w SPEC, nie usterka do naprawy geometrią. Funkcja nie znika i nie ląduje na osobnej części po to, by nawis był 0%.
5) Przy tym samym gabarycie lżejsza bryła wygrywa. Nie dokładaj mięsa.
6) Ścianka pudła <2,0 mm w SPEC → ostrzeż „cienkie ścianki FDM — ryzyko lichości na łączeniach, rozważ ≥2 mm” (nie cicho buduj 1,6 mm).
7) 3MF bez project_settings. Podpory dorysowuje Studio. Checklista: TYP i DLACZEGO. „Podpory: nie” przy zwisie-funkcji to udawanie slicera.

SUFIT PRODUKTU — CO MUSI BYĆ PRAWDA (bramki aplikacji, zero przykładów CAD)
1) Max 8 części w jednym SPEC 1.1 — schema maxItems i builder odrzucą 9.
2) Każda część ≤256 mm na każdej osi — bramka PLYTA. Brief >250 mm = podział na części, nie skala w dół ani jeden gigant.
3) Gdy są bryły: orientacja_druku + podpory + brim obowiązkowe — schema allOf i walidujPlanDruku; brak = odrzucenie SPEC, nie ciche budowanie.
4) podpory.wymagane true|false + uzasadnienie + typ (gdy true). „Podpory: nie” przy zwisie-funkcji bez decyzji = udawanie slicera; bramka ostrzega PODPORY, ale schema musi złapać brak pola.
5) 3MF = dokładnie 3 wpisy ZIP (geometria unit=millimeter), bez project_settings ani model_settings — profil KALIBROWANE wybiera człowiek w Studio.
6) derivedFrom=estimated / pochodzenie_wymiaru=szacunek = eksperymentalny werdykt, nie PASS produkcyjny.
7) Projekt: N=96 (okręgi). Przerób: N=192. Nie mieszaj kanałów ani liczby boków.
8) Przerób w tej wersji: walec tak; szczelina i kieszeń nie.
9) B-Rep (faza/zaokrąglenie) domyślnie wyłączone — faza/zaokrąglenie idzie CSG jak dziś.

KOLEJNOŚĆ
0) Jednym zdaniem: CO MA SIĘ FIZYCZNIE WYDARZYĆ, kiedy ta rzecz działa poprawnie. Jeśli nie umiesz — dopytaj.
1) Jedno pytanie, którego inni nie zadają (obciążenie, woda, jak często zdejmowane). Dzieci — tylko gdy PROFIL DOMU tego nie mówi.
2) 2–3 sposoby i jedna rekomendacja — zanim poprosisz o pełny rysunek.
3) Przy sprzęcie albo obcej klasie [[SZUKAJ]], potem rysunek. Nie odwrotnie.
4) Po 3MF: oceń WYNIK 3MF. 2–3 poprawki jako rada (ścianka, orientacja, kubek) — nie cicha zmiana siatki.

SZABLONY PARAMETRYCZNE
Gdy w kontekście pojawi się blok „SZABLONY PARAMETRYCZNE", masz gotowe funkcje CSG. Zamiast opisywać bryły od zera, użyj znacznika [[SZABLON:id(parametry)]] — aplikacja wygeneruje SPEC automatycznie.
Przykład: użytkownik pisze „zrób rurę F80 pod kątem 90 stopni" → Ty odpowiadasz z planem druku i kończysz [[SZABLON:rurKolanko(80,90,2)]].
Szablon sam wypełnia bryły, cechy, materiał, uwagi. Ty musisz tylko podać ORIENTACJA/PODPORY/BRIM jak zwykle.
Gdy szablon nie pasuje idealnie lub użytkownik chce coś niestandardowego — rysuj klasycznie ([[RYSUJ]]).

BAZA NAUKI — PAMIĘĆ KATALOGU (NAZWANE CZĘŚCI)
W każdej Twojej turze aplikacja dokłada blok „PAMIĘĆ KATALOGU” / „BAZA NAUKI” z 5 najbliższymi wzorcami. To POSSEGREGOWANE DOBRE modele, które już oglądałeś: tytuły, tagi (rura/kolanko/90/Fi) i opis wyciągnięty z pliku 3MF (metadata Title/Description, nazwy części) albo z folderu gdy STL. Nie kolejka odrzutów i nie trening GPU. Gdy brief ma rurę / Fi / F80 / DN / kolanko / 90°, NAJPIERW weź te trafienia, nie zgaduj od zera. Naśladuj strukturę i funkcję najbliższych nazw. Nie kopiuj cudzego CAD. BLAD_POMIARU = dziura pomiaru, nie „zły model”. Folder ocen/ pusty. Działa z dowolnym modelem z ⚙ Asystent.
Katalog LIB/TRE/GOLD jest PRZEĆWICZONY (retrieval self-hit, nie LoRA): traktuj go jako pamięć już widzianych projektów. Ćwiczył ten katalog: gdy ktoś prosi o X, masz wzorzec Y (już widziany). Wagi modelu się nie zmieniają.

BRIEF PEŁNY, TYLKO prosty klips/haczyk/podstawka z mm (USB 5 mm, haczyk 18 mm): pomiń 1–2. Zera nie pomijaj (CO SIĘ DZIEJE). W tej turze plan druku i [[RYSUJ]]. Bez dopytywania o rasę kota. Brak filamentu: klips/haczyk/uchwyt/podstawka → PETG; figurka/pionek/topper/napis → PLA — napisz wybór przy BRIM.

MARKA / ELEKTRONIKA / OBUDOWA PADA / NAZWA PRODUKTU (Vader, Flydigi, Biedronka Jumbo, ANDER, PCB, kontroler): NIE wolno pominąć szukania, nawet gdy brief ma mm. Najpierw [[SZUKAJ]] (Printables, MakerWorld, GitHub, wymiary obudowy/PCB). Dopiero potem rysunek. Jeśli sieć nie ma gerbera płyty — powiedz to wprost. Albo [[CZEKAM]] na suwmiarkę, albo [[RYSUJ]] z etykietą „prototyp, szacunek, NIE drop-in”. Zakaz pudełka z dwoma walcami w powietrzu jako „obudowa pada”. To atrapa, nie produkt.

TOPPER / NAPIS NA TORT: litery połączone, wysokość 25–40 mm, nóżki 80–100 mm, FDM 0,4 bez włosków. Silnik ma kształt napis. Jeśli >250 mm szerokości — złam na 2–3 linie. Traktor wpleć w kompozycję (wplec_traktor albo bryła traktor + mostek), nie obok na siłę.

OCIEKACZ / RZECZ >256 mm: w 1 zdaniu powiedz PODZIAŁ (ile części, wpusty), każda ≤250 mm. Nie [[CZEKAM]] po mm 55×24 cm — to 550×240, trzy kawałki tacy + stelaż. [[RYSUJ]] jak zwykle — aplikacja sama tnie SPEC na części (nie jeden gigantyczny JSON).
ZASUWA / RYGIEL: [[RYSUJ]] korpus + rygiel; aplikacja złoży dwa osobne SPEC-y.

FIGURKA FDM (kot, pies, robot, pionek): silnik składa z walców, kul, stożków i prostopadłościanów — NIE jeden klocek. W 1 zdaniu wymień części (głowa, tułów, uszy, łapy, ogon/ramiona, płaska stopa na Z=0). Styl klockowy, gruby pod dyszę 0,4 mm. Zero podpór jeśli nachylenia <45°. Wysokość = liczba z briefu. Potem plan druku i [[RYSUJ]].

ZABAWKA / GRA / UKŁADANKA:
spytaj o WIEK. Poniżej 3 lat obowiązuje norma małych części: element nie może zmieścić się w walcu Ø31,7 x 57,1 mm — praktycznie dwa wymiary ≥45 mm. Krawędzie zaokrąglone. Powiedz jednym zdaniem, CO SIĘ FIZYCZNIE DZIEJE przy poprawnym użyciu; jeśli odpowiedź brzmi „nic", to nie jest zabawka. Zabawkę się nosi i chowa. JAK to osiągniesz — twoja sprawa.

DOM / PRAKTYCZNE:
spytaj o OBCIĄŻENIE i WILGOĆ. Woda, ciepło albo obciążenie = PETG. Powiedz, do czego to się mocuje i czy da się tam zamocować. Nad wodą albo jedzeniem — musi się dać zdjąć i umyć.

PASUJĄCE DO ISTNIEJĄCEJ RZECZY (rura, uchwyt, obejma, adapter):
nie rysujesz bez zmierzonej liczby. Powiedz wprost, czy pasujesz do średnicy zewnętrznej czy wewnętrznej. Luz z tabeli, nigdy z głowy. Powiedz, jak się to zakłada i zdejmuje.

TON
- Ostrzegaj: „lepiej nie, tego nie róbmy, będzie gorzej”.
- Nie kłóć się i nie wykładaj. Zero „jesteś w błędzie”. Mów: „da się, ale gorzej, bo…; lepiej tak”.
- Człowiek wybiera. Ty polecasz. Bądź ciekawski: dopytaj, zanim narysujesz.

Gdy ktoś pisze tylko „do wanny” / „zrób uchwyt”:
1. Dopytaj: okrągła wolnostojąca / prosta przy ścianie / owalna; rant; czy ścianka gładka. Jedno–dwa pytania, nie lista.
2. Potem 2–3 sposoby, zanim poprosisz o pełny rysunek: przyssawki + konkretny kubek ze sklepu (Qinuo QNSC-M40 Ø40, grzybek) / klamra na rant / hak. Inny trik jeśli pasuje.
3. Jedną opcję poleć i dlaczego (okrągła gładka → przyssawki, łatwiej zdjąć, bez wiercenia).
4. Extras TYLKO jako propozycje: szampon, odpływ szczelinami, zaokrąglenia, faza, gąbka, mniejszy/większy (ścianka, czas, sztywność). Nie dodawaj ich po cichu do siatki.
5. Głupie briefy (wiercenie w wannie, prosty hak na okrągły rant): „lepiej nie” i lepsza droga.

TWARDY PORZĄDEK
- Milimetry wpisuje człowiek. Ze zdjęcia nie czytasz Ø.
- Gdy puste p2s.ai.profil / ustawienie sprzętu: fakt — w domu jest małe dziecko; zabawka: norma małych części Ø31,7×57,1 mm (praktycznie dwa wymiary ≥45 mm). Nie pytaj o to przy każdym SPEC.
- Brief z funkcją + mm: w tej turze ORIENTACJA/PODPORY/BRIM i [[RYSUJ]]. Bez [[CZEKAM]]. Brak filamentu → PETG (mechanika) albo PLA (figurka).
- Przed [[RYSUJ]] materiał musi być znany albo przyjęty jak wyżej (PLA/PETG/ABS/TPU). Gdy brief jest pusty (samo „zrób uchwyt”) — zapytaj krótko i zakończ [[CZEKAM]].
- Przed [[RYSUJ]] dopytaj o brakujące mm (grubość drzwi/ścianki, Ø kubka/trzpienia, rozstaw, obciążenie). Nie zgaduj. Brak pomiaru → [[CZEKAM]].
- Nie piszesz JSON, OpenSCAD ani kodu. SPEC jest osobnym krokiem, dopiero po wyborze sposobu.
- Nie wymyślasz otworów pod wkręty do wanny.

SZUKANIE W SIECI
Przy sprzęcie (śruby, przyssawki, grubość drzwi, podobne produkty, bezpieczeństwo) i ZAWSZE przy marce/elektronice najpierw jeden znacznik:
[[SZUKAJ]] krótkie hasło EN (np. Flydigi Vader 5 Pro PCB dimensions Printables, Słonik Jumbo paper towel diameter mm).
Gdy klasa przedmiotu jest ci obca (nie robiłeś jeszcze sortera, zamka, karmnika): [[SZUKAJ]] jak rozwiązują to inni, ZANIM zaproponujesz. Nie kopiuj — zobacz mechanizm i powiedz, co z tego bierzesz i dlaczego.
Aplikacja pobierze Wikipedia/DuckDuckGo (bez Twojego klucza) i wróci z wynikami. W tej samej odpowiedzi co [[SZUKAJ]] nie stawiaj [[RYSUJ]].
Jeśli szukanie się nie uda albo jesteś offline: napisz wprost „nie sprawdziłem w sieci, dopytuję Ciebie” — obowiązkowo przy obciążeniu, dzieciach, wyjściu ewakuacyjnym, ogniu, obudowie elektroniki. Potem pytania. Nie zmyślaj gerbera.

ATRAPA
Nie wolno oddać pudełka / mydła CSG i nazwać tego obudową, ociekaczem albo zamkiem. Jeśli nie umiesz złożyć z listy kształtów albo brakuje PCB — [[CZEKAM]] albo prototyp z jawnym „NIE drop-in”. Nie udawaj produktu.

PLAN DRUKU — w tej samej odpowiedzi, PRZED znacznikiem [[RYSUJ]], napisz trzy decyzje (nie JSON):
ORIENTACJA: która ściana leży na płycie (np. spód płytki, największa płaska).
PODPORY: tak albo nie, i dlaczego. Gdy tak — typ: tylko na płycie / organiczne / drzewiaste / normalne.
BRIM: tak albo nie, i dlaczego. Wysoki wąski słupek → brim. Płaski PLA/PETG na PEI/Frostbite → zwykle nie.
POPRAWKI: 1–2 zdania co bym zmienił po próbnym wydruku (ścianka, orientacja, kubek) — rada, nie cicha zmiana siatki.
Studio samo dorysowuje podpory i brim; 3MF to geometria. Człowiek sprawdzi podgląd cięcia, proces 0.20 Standard (5.18), wysyłkę: dynamika Auto jeśli szpula skalibrowana.
Bez ORIENTACJA/PODPORY/BRIM nie wolno stawiać [[RYSUJ]].

ZDJECIE
Gdy człowiek dołączy zdjęcie (klamka, drzwi, wanna): zapytaj, KTÓRE wymiary zmierzy suwmiarką, a które wolno przyjąć. Nie podawaj milimetrów z fotki. Jeśli musisz oszacować — napisz wprost „szacunek, nie pomiar”. Zdjęcie to kształt i topologia, nie suwmiarka. Nie udawaj, że widzisz drzwi, gdy dostałeś tylko opis z Flash.

KONIEC ODPOWIEDZI — dokładnie jeden znacznik (aplikacja go odetnie):
[[SZUKAJ]] hasło — gdy potrzebujesz faktów z sieci.
[[CZEKAM]] gdy brakuje wyboru sposobu, kształtu, pomiarów albo człowiek ma się zdecydować — NIE gdy brief już ma funkcję i mm.
[[RYSUJ]] gdy wybrał sposób, są mm albo pytania SPEC je zbiorą, podałeś ORIENTACJA/PODPORY/BRIM. Nie zgadujesz Ø z fotki.
[[SZABLON:id(parametry)]] gdy szablon z kontekstu pasuje idealnie — aplikacja sama zbuduje SPEC z podanych parametrów. Plan druku (ORIENTACJA/PODPORY/BRIM) obowiązkowy jak przy [[RYSUJ]].`;

let schema = null;
let last = null;
let lastIdx = 0;
let pytanieRundy = 0;
let engineOk = false;
let engineTried = false;
let enginePromise = null;
let pjPendingImgs = [];
let pjProjectId = '';

function $(id) { return document.getElementById(id); }
function get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
function set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

/** Puste ustawienie sprzętu / p2s.ai.profil → fakt offline, nie pytanie przy SPEC. */
const FAKT_DZIECKO_OFFLINE = 'w domu jest małe dziecko; zabawka: norma małych części Ø31,7×57,1 mm (praktycznie dwa wymiary ≥45 mm)';
function pjFaktDomu() {
  const note = (get('p2s.ai.note', '') || '').trim();
  if (note) return note;
  let profilRaw = null;
  try { profilRaw = (typeof localStorage !== 'undefined') ? localStorage.getItem('p2s.ai.profil') : null; } catch (e) { profilRaw = null; }
  /* p2s.ai.profil w UI to konserwatywny/eksperymentalny; puste albo brak + puste p2s.ai.note → fakt dziecka. */
  if (profilRaw == null || String(profilRaw).trim() === '') return FAKT_DZIECKO_OFFLINE;
  return FAKT_DZIECKO_OFFLINE;
}
function pjSysTalk() {
  return SYS_TALK + '\n\nPROFIL DOMU (fakt, nie pytanie):\n' + pjFaktDomu();
}
/** Każda tura Projekt: pamięć katalogu (5 wzorców + opis z 3MF), nie LoRA/GPU. */
async function pjKontekstNauki(text) {
  try {
    await ladujPackNauki(false);
    const hits = await szukajNauki(text, 5);
    const ragTagi = (hits || []).flatMap(h => Array.isArray(h.tagi) ? h.tagi : []);
    const szablony = dopasujSzablony(text, ragTagi);
    const szablonyTekst = tekstSzablonow(szablony);
    return tekstKontekstuNauki(hits, text, szablonyTekst);
  } catch (e) {
    return '';
  }
}
function pjSysSpec() {
  return SYS_SPEC + '\n\nPROFIL DOMU (fakt, nie pytanie — nie dodawaj pytania o dzieci ani o 45 mm):\n' + pjFaktDomu();
}

function key() { return get('p2s.ai.key', ''); }
function model(role) {
  if (role === 'spec') return get('p2s.ai.model.code', 'anthropic/claude-opus-5');
  if (role === 'diff') return get('p2s.ai.model.json', 'anthropic/claude-opus-5');
  return get('p2s.ai.model', 'anthropic/claude-opus-5');
}

/** AA 27.08.2026: Opus 5 max = mózg. Cena bez znaczenia przy kilku pytaniach. */
const MOZOG = 'anthropic/claude-opus-5';
const MOZGI_TALK = [
  'anthropic/claude-opus-5',
  'x-ai/grok-4.6',
  'openai/gpt-5.6-sol-pro',
  'deepseek/deepseek-v4-pro-0813'
];
const MOZGI_SPEC = [
  'anthropic/claude-opus-5',
  'x-ai/grok-4.6',
  'openai/gpt-5.6-sol-pro',
  'deepseek/deepseek-v4-pro-0813'
];

const OR_MODELS = 'https://openrouter.ai/api/v1/models';
const PRESET_TALK = [
  { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5 · mózg (reasoning max)' },
  { id: 'x-ai/grok-4.6', label: 'Grok 4.6 · zapas xhigh' },
  { id: 'openai/gpt-5.6-sol-pro', label: 'GPT-5.6 Sol Pro · zapas max' },
  { id: 'deepseek/deepseek-v4-pro-0813', label: 'DeepSeek V4 Pro 0813 · myślący JSON' },
  { id: 'qwen/qwen3.8-max', label: 'Qwen 3.8 Max · otwarty zapas' }
];
const PRESET_SPEC = [
  { id: 'anthropic/claude-opus-5', label: 'Claude Opus 5 · SPEC JSON (max)' },
  { id: 'x-ai/grok-4.6', label: 'Grok 4.6 · SPEC zapas xhigh' },
  { id: 'openai/gpt-5.6-sol-pro', label: 'Sol Pro · SPEC zapas' },
  { id: 'deepseek/deepseek-v4-pro-0813', label: 'DeepSeek V4 Pro · SPEC JSON' },
  { id: 'qwen/qwen3.8-max', label: 'Qwen 3.8 Max · SPEC zapas' }
];
let orCatalog = null;

function rodzinaModelu(id) {
  return /claude-opus-5|claude-fable-5|grok-4|qwen3\.8-max|deepseek-v4|gpt-5\.6-sol|gpt-5\.6-luna|gemini-3\.7-flash|gpt-5\.6-terra/i.test(String(id || ''));
}

function pjJestMozgiem(id) {
  return /claude-opus-5|claude-fable-5|gpt-5\.6-sol-pro|grok-4\.6|deepseek-v4-pro|qwen3\.8-max/i.test(String(id || ''));
}

function pjModelRoli(role) {
  const w = model(role);
  return pjJestMozgiem(w) ? w : MOZOG;
}

function pjProfil() {
  const v = get('p2s.ai.profil', 'konserwatywny');
  return v === 'eksperymentalny' ? 'eksperymentalny' : 'konserwatywny';
}

function lancuchMozgu(wybrany, lista) {
  const out = [];
  const first = pjJestMozgiem(wybrany) ? wybrany : MOZOG;
  out.push(first);
  if (!orWolnoLancuchZapasu(pjProfil())) return out;
  (lista || []).forEach(function (id) { if (out.indexOf(id) < 0) out.push(id); });
  return out;
}

function pjReasoning(modelId, requested) {
  const id = String(modelId || '');
  /* jawny budżet myślenia ma pierwszeństwo: effort liczy się jako część max_tokens */
  if (requested && requested.max_tokens) return requested;
  if (/grok-4-fast/.test(id)) return { enabled: true };
  if (/grok-4\.6/.test(id)) return { effort: 'xhigh' };
  if (/claude-opus-5|claude-fable-5|gpt-5\.6-sol|deepseek-v4-pro/.test(id)) return { effort: 'max' };
  if (requested && requested.effort) return requested;
  return { effort: 'high' };
}

function migrujMozgV16() {
  if (get('p2s.ai.mozg.v16', '')) return;
  const tanie = /gemini-3\.7-flash|gpt-5\.6-luna|gpt-5\.6-sol$|x-ai\/grok-4-fast/;
  ['p2s.ai.model', 'p2s.ai.model.code', 'p2s.ai.model.json', 'p2s.ai.model.vision', 'p2s.ai.model.plan'].forEach(function (k) {
    const v = get(k, '');
    if (!v || tanie.test(v)) set(k, MOZOG);
  });
  set('p2s.ai.mozg.v16', '1');
}

function fillPjSelect(sel, presets, current, catalog) {
  if (!sel) return;
  const seen = new Set();
  const bits = [];
  bits.push('<optgroup label="Polecane">');
  presets.forEach(p => {
    seen.add(p.id);
    const brak = catalog && !catalog.has(p.id);
    bits.push('<option value="' + escapeHtml(p.id) + '"' + (p.id === current ? ' selected' : '') + '>'
      + escapeHtml(p.label + (brak ? ' — nie na liście API' : '')) + '</option>');
  });
  bits.push('</optgroup>');
  if (catalog) {
    const extra = [...catalog].filter(id => !seen.has(id) && rodzinaModelu(id)).sort();
    if (extra.length) {
      bits.push('<optgroup label="Rodzina z OpenRouter">');
      extra.forEach(id => {
        bits.push('<option value="' + escapeHtml(id) + '"' + (id === current ? ' selected' : '') + '>'
          + escapeHtml(id) + '</option>');
      });
      bits.push('</optgroup>');
    }
  }
  if (current && !seen.has(current) && !(catalog && catalog.has(current))) {
    bits.unshift('<option value="' + escapeHtml(current) + '" selected>' + escapeHtml(current) + '</option>');
  }
  sel.innerHTML = bits.join('');
}

function syncPjModeleHint(catalog) {
  const el = $('pjModelHint');
  if (!el) return;
  const talk = model('talk');
  const spec = model('spec');
  const k = key() ? 'Klucz OpenRouter jest na tym urządzeniu.' : 'Brak klucza — wklej w ⚙ Asystenta.';
  const cat = catalog
    ? ('OpenRouter zgłasza ' + catalog.size + ' modeli; Sol/Grok widać, gdy są na liście.')
    : 'Lista API niedostępna — zostają przypięte slugi.';
  el.textContent = 'Rozmowa: ' + talk + ' · SPEC: ' + spec
    + ' · profil: ' + pjProfil()
    + '. Talk ' + (PJ_TIMEOUT_TALK_MS / 60000) + ' min / SPEC ' + (PJ_TIMEOUT_SPEC_MS / 60000)
    + ' min. Mózg: Claude Opus 5 + reasoning max. '
    + (pjProfil() === 'konserwatywny'
      ? 'Konserwatywny: 408/429 = retry Opusa, bez Groka. '
      : 'Eksperymentalny: po retry wolno zapas Grok/Sol. ')
    + 'Flash/Luna nie rysują — to one robiły atrapy. ' + k + ' ' + cat;
}

function onPjModelChange() {
  const t = $('pjModelTalk');
  const s = $('pjModelSpec');
  const p = $('pjProfil');
  if (t && t.value) set('p2s.ai.model', t.value);
  if (s && s.value) {
    set('p2s.ai.model.code', s.value);
    set('p2s.ai.model.json', s.value);
  }
  if (p && p.value) {
    set('p2s.ai.profil', p.value === 'eksperymentalny' ? 'eksperymentalny' : 'konserwatywny');
  }
  syncPjModeleHint(orCatalog);
  pjPokazStamp();
  const lbl = document.getElementById('aiModelLbl');
  if (lbl) {
    const m = model('talk');
    lbl.textContent = m.split('/').pop();
    lbl.title = 'Polski: ' + m + '\nSPEC: ' + model('spec');
  }
}

function pjPokazStamp() {
  const el = $('pjBuildStamp');
  const meta = pjMetaWersji();
  const txt = 'Wersja ' + meta.wersja
    + ' · talk ' + (PJ_TIMEOUT_TALK_MS / 60000) + ' min · SPEC ' + (PJ_TIMEOUT_SPEC_MS / 60000) + ' min'
    + ' · profil ' + pjProfil()
    + (meta.stamp ? (' · cache ' + meta.stamp) : '')
    + '. Na telefonie: zamknij PWA, w Chrome menu → Odinstaluj / wyczyść dane strony, wejdź ponownie — stary Service Worker trzyma 4.2.16.';
  if (el) el.textContent = txt;
  if (typeof window !== 'undefined') {
    window.P2S_VER_NAME = meta.wersja;
    window.__P2S_META = Object.assign({}, window.__P2S_META || {}, {
      wersja: meta.wersja,
      talk_ms: PJ_TIMEOUT_TALK_MS,
      spec_ms: PJ_TIMEOUT_SPEC_MS,
      stamp: meta.stamp,
      profil: pjProfil()
    });
  }
}

function pjOriginFile() {
  return typeof location !== 'undefined' && location.protocol === 'file:';
}

const PJ_FILE_ORIGIN_MSG =
  'Zakładka Projekt nie woła OpenRoutera z pliku na dysku (Origin null, CORS). '
  + 'Otwórz https://lakomako222-star.github.io/przewodnik-p2s/ albo zainstaluj PWA '
  + '(Chrome → Dodaj do ekranu głównego). SPEC możesz wkleić ręcznie — budowanie i 3MF działają lokalnie.';

function pjPokazOstrzezenieFile() {
  const el = typeof $ === 'function' ? $('pjFileOrigin') : null;
  if (!el) return;
  if (pjOriginFile()) {
    el.hidden = false;
    el.textContent = PJ_FILE_ORIGIN_MSG;
  } else {
    el.hidden = true;
  }
}

async function pjPobierzWersjaJson() {
  try {
    // file://: Fetch API nie ładuje względnego JSON. Stamp jest już w HTML.
    // APK: origin appassets, ./wersja.json z /biezaca/ albo /assets/.
    // Aktualizacja *paczki* APK idzie mostkiem Java (apk/version.json).
    // Treść przewodnika schodzi w tle do katalogu wewnętrznego.
    if (pjOriginFile()) return;
    const r = await fetch('./wersja.json', { cache: 'no-store' });
    if (!r.ok) return;
    const j = await r.json();
    if (typeof window !== 'undefined') {
      window.__P2S_META = Object.assign({}, window.__P2S_META || {}, j);
      if (j.wersja) {
        window.P2S_VER_NAME = j.wersja;
        window.__P2S_TRESJ_JSON = String(j.wersja);
      }
    }
    pjPokazStamp();
    if (typeof fillWersjaChip === 'function') fillWersjaChip();
  } catch (e) {}
}

async function loadPjModele() {
  fillPjSelect($('pjModelTalk'), PRESET_TALK, model('talk'), orCatalog);
  fillPjSelect($('pjModelSpec'), PRESET_SPEC, model('spec'), orCatalog);
  const p = $('pjProfil');
  if (p) p.value = pjProfil();
  syncPjModeleHint(orCatalog);
  if (orCatalog) return;
  try {
    if (pjOriginFile()) {
      orCatalog = null;
      syncPjModeleHint(null);
      return;
    }
    const r = await fetch(OR_MODELS);
    const j = await r.json();
    orCatalog = new Set((j.data || []).map(m => m && m.id).filter(Boolean));
  } catch (e) {
    orCatalog = null;
    syncPjModeleHint(null);
    return;
  }
  fillPjSelect($('pjModelTalk'), PRESET_TALK, model('talk'), orCatalog);
  fillPjSelect($('pjModelSpec'), PRESET_SPEC, model('spec'), orCatalog);
  syncPjModeleHint(orCatalog);
}

function hist() {
  try { const a = JSON.parse(get(HIST_KEY, '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function pushHist(entry) {
  const a = hist();
  a.push(entry);
  while (a.length > 20) a.shift();
  set(HIST_KEY, JSON.stringify(a));
  fillHist();
}

function fillHist() {
  const sel = $('pjHist'); if (!sel) return;
  const a = hist();
  sel.innerHTML = a.map((e, i) => '<option value="' + i + '"' + (i === a.length - 1 ? ' selected' : '') + '>v' + (i + 1) + (e.note ? ' — ' + e.note : '') + '</option>').join('')
    || '<option value="">Historia</option>';
}

function chatLine(who, text) {
  const box = $('pjChat'); if (!box) return;
  const d = document.createElement('div');
  d.className = 'pj-line ' + who;
  d.textContent = (who === 'me' ? '> ' : '< ') + text;
  box.appendChild(d);
}

function pjRysujMiniaturki() {
  const box = $('pjThumbs');
  if (!box) return;
  box.innerHTML = pjPendingImgs.map((s, i) =>
    '<div class="pj-thumb"><img src="' + s + '" alt=""><button type="button" data-i="' + i + '" aria-label="Usuń">×</button></div>'
  ).join('');
  box.hidden = !pjPendingImgs.length;
}

function pjPokazHintWizji() {
  const el = $('pjVisionHint');
  if (!el) return;
  if (!pjPendingImgs.length) { el.hidden = true; el.textContent = ''; return; }
  el.hidden = false;
  el.textContent = hintWizji(model('talk'));
}

async function pjDolaczZdjecie(file) {
  if (!file) return;
  const url = await kompresujZdjecie(file);
  if (url) {
    pjPendingImgs.push(url);
    while (pjPendingImgs.length > 3) pjPendingImgs.shift();
    pjRysujMiniaturki();
    pjPokazHintWizji();
  }
}

async function pjOpisZdjeciaFlash(imgs, orCallFn) {
  const call = orCallFn || orCall;
  if (!imgs || !imgs.length) return '';
  if (imgs.length === 1 && imgs[0] === TINY_PNG_DATA_URL) {
    const m = mockOpisZdjecia(imgs[0]);
    return m.ok ? m.opis : '';
  }
  const content = trescZZdjeciami(promptOpisuZdjecia(), imgs);
  return await call({ model: VISION_FLASH, messages: [{ role: 'user', content }] });
}

function pjWlaczPrzerobTo(on) {
  const b = $('pjPrzerobTo');
  if (b) b.disabled = !on;
}

async function pjBajty3mf() {
  if (!last || !last.mesh) return null;
  const lista = (last.czesci || []).filter(c => c && c.mesh);
  if (lista.length > 1) {
    return mesh3MFWiele(lista.map(c => ({
      nazwa: (c.spec && c.spec.nazwa) || last.spec.nazwa,
      mesh: c.mesh,
      bbox: c.mesh.bbox
    })), { nazwa: last.spec.nazwa, spec: last.spec });
  }
  return mesh3MF(last.mesh, { nazwa: last.spec.nazwa, spec: last.spec });
}

async function pjZapiszNitke(opts) {
  if (!last || !last.spec) return null;
  if (!pjProjectId) pjProjectId = nowyProjectId(last.spec);
  let blob = null;
  try { blob = await pjBajty3mf(); } catch (e) { blob = null; }
  const check = (typeof checklistaDruku === 'function')
    ? checklistaDruku(last.spec, last.werdykt)
    : '';
  const pack = zapiszNitke({
    id: pjProjectId,
    spec: last.spec,
    mesh: last.mesh,
    blob,
    podsumowanie: skrotRozmowy(pjChatBlob()),
    checklista: check,
    nazwa: last.spec.nazwa
  });
  pjWlaczPrzerobTo(!!(last.mesh && (opts && opts.force || last.werdykt)));
  return pack;
}

function pjOtworzPrzerob() {
  const t = document.querySelector('#tabs .tab[data-v="przerobka"]');
  if (t) t.click();
  if (typeof window.__p2sPrzerobWczytajNitke === 'function') {
    window.__p2sPrzerobWczytajNitke(pjProjectId);
  }
}

async function pjPrzerobTo() {
  if (!last || !last.mesh) {
    chatLine('ai', 'Najpierw złóż rysunek (3MF), potem Przerób to.');
    return;
  }
  await pjZapiszNitke({ force: true });
  chatLine('ai', 'Nitka jedzie do Przerobu: SPEC, siatka i checklista. Napisz „powiększ o 10%” albo „dodaj otwór 6 mm” — bez wklejania JSON.');
  pjOtworzPrzerob();
}

function pokazCheckliste(spec, werdykt) {
  const el = $('pjDrukLista');
  if (!el) return;
  if (!spec || !spec.podpory || !spec.brim || !spec.orientacja_druku) {
    const cz = (spec && spec.czesci || []).find(c => c && c.podpory && c.brim && c.orientacja_druku);
    if (!cz) { el.hidden = true; el.innerHTML = ''; return; }
  }
  const txt = checklistaDruku(spec, werdykt);
  el.hidden = false;
  el.innerHTML = '<h3>Checklista druku</h3>'
    + '<div class="btnrow" style="margin:0 0 8px"><button type="button" class="btn pri" id="pjKopiujStudio">Kopiuj — wyślij do Studio</button></div>'
    + txt.split('\n').filter(function (l) { return l.trim(); }).map(function (l) {
      return '<p>' + escapeHtml(l) + '</p>';
    }).join('');
  const kop = $('pjKopiujStudio');
  if (kop) kop.addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(txt);
      kop.textContent = 'Skopiowane';
      setTimeout(function () { kop.textContent = 'Kopiuj — wyślij do Studio'; }, 1600);
    } catch (e) {
      window.prompt('Skopiuj checklistę:', txt);
    }
  });
  chatLine('ai', txt);
}

function setWarn(werdykt, extra) {
  const el = $('pjWarn'); if (!el) return;
  const wp = (werdykt && werdykt.wpisy) || [];
  const all = extra ? extra.concat(wp) : wp;
  if (!all.length) { el.innerHTML = ''; return; }
  el.innerHTML = all.map(w => {
    const k = w.poziom === 'blad' ? 'pj-err' : 'pj-warn';
    return '<div class="' + k + '">' + (w.poziom === 'blad' ? '⛔ ' : '⚠ ') + escapeHtml(w.tekst || w) + '</div>';
  }).join('');
}

/** Pudło CSG: kosz + wnetrze → grubość ściany z różnicy wymiarów/pozycji. */
function pjGruboscSciankiZSpec(spec) {
  const PROG = 2.0;
  let min = Infinity;
  const czesci = (spec && spec.czesci) || [];
  for (const cz of czesci) {
    const bryly = cz.bryly || [];
    const outer = bryly.find((b) => b.operacja === 'dodaj' && b.ksztalt
      && b.ksztalt.typ === 'prostopadloscian' && /kosz/i.test(String(b.id || '')));
    const inner = bryly.find((b) => b.operacja === 'odejmij' && b.ksztalt
      && b.ksztalt.typ === 'prostopadloscian' && /wnetrze/i.test(String(b.id || '')));
    if (!outer || !inner) continue;
    const ox = outer.ksztalt.x_mm, oy = outer.ksztalt.y_mm;
    const ix = inner.ksztalt.x_mm, iy = inner.ksztalt.y_mm;
    const px = (outer.pozycja_mm || [])[0] || 0;
    const py = (outer.pozycja_mm || [])[1] || 0;
    const ipx = (inner.pozycja_mm || [])[0] || 0;
    const ipy = (inner.pozycja_mm || [])[1] || 0;
    const wx = ((px + ox - (ipx + ix)) + (ipx - px)) / 2;
    const wy = ((py + oy - (ipy + iy)) + (ipy - py)) / 2;
    min = Math.min(min, wx, wy);
  }
  if (!Number.isFinite(min)) return null;
  return { mm: +min.toFixed(3), prog: PROG, cienka: min < PROG - 1e-6 };
}

function pjOstrzCienkieSciankiSpec(spec, werdykt) {
  const g = pjGruboscSciankiZSpec(spec);
  if (!g || !g.cienka) return werdykt;
  const wpis = {
    poziom: 'ostrzezenie',
    kod: 'SCIANKA_CIENKA',
    tekst: 'Cienkie ścianki FDM (' + g.mm + ' mm < ' + g.prog + ' mm) — ryzyko lichości na łączeniach; rozważ ≥2 mm albo więcej obwodów.'
  };
  const wpisy = ((werdykt && werdykt.wpisy) || []).slice();
  if (!wpisy.some((w) => w.kod === 'SCIANKA_CIENKA')) wpisy.unshift(wpis);
  return Object.assign({}, werdykt || {}, { wpisy });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function foldPj(s) {
  return String(s || '').toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l')
    .replace(/ń/g, 'n').replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ź/g, 'z').replace(/ż/g, 'z');
}

function pjChatBlob() {
  const box = $('pjChat');
  return box ? (box.textContent || '') : '';
}

function pjObetnijZnacznik(s) {
  return String(s || '')
    .replace(/\s*\[\[\s*SZUKAJ\s*\]\][^\n]*/gi, '\n')
    .replace(/\s*\[\[(CZEKAM|RYSUJ)\]\]\s*/gi, '\n')
    .replace(/\n{3,}/g, '\n\n').trim();
}

function pjBriefZaCienki(text) {
  const t = foldPj(text);
  if (/\d+(?:[.,]\d+)?\s*(?:mm|cm)\b/.test(t) && /\b(pla|petg|abs|tpu)\b/.test(t)) return false;
  const sposob = /przyss?awk|klamr|hak|clip|klips|suction|figurk|pionek|robot|podstawk/.test(t);
  const wanna = /wann|rant|mydel|mydl|soap|uchwyt/.test(t);
  if (wanna && !sposob) return true;
  if (/^(zrob|zrobic)\b/.test(t) && !sposob && !/\d+\s*mm/.test(t)) return true;
  return false;
}

function pjTalkMaPlanDruku(talk) {
  const t = foldPj(talk);
  const ori = /orientacj|na plycie|na stole|sciana na plycie/.test(t);
  const pod = /podpor/.test(t);
  const brim = /\bbrim\b/.test(t);
  return ori && pod && brim;
}

function pjUserMaMm(text) {
  return /\d+(?:[.,]\d+)?\s*(?:mm|cm)\b/i.test(String(text || ''));
}

function pjWymagaSzukania(text) {
  return /vader|flydigi|biedronka|jumbo|s[lł]onik|pcb|kontroler|obudow|gerber|elektron|printables|thingiverse|makerworld/i.test(foldPj(text));
}

function pjByloSzukanie() {
  return /Szukam:|Wikipedia:|wynik szukania/i.test(pjChatBlob());
}

function pjSzacunekZFotki(text) {
  return /Opis zdjęcia \(Flash|szacunek jeśli|ze zdjęcia nie|tylko topologia|jak na zdjęciu/i.test(String(text || ''));
}

function pjGotoweDoSpec(talk, text, prev) {
  if (/\[\[SZUKAJ\]\]/i.test(talk)) return false;
  if (/\[\[CZEKAM\]\]/i.test(talk)) return false;
  if (!prev && pjWymagaSzukania(text) && !pjByloSzukanie()) return false;
  if (pjBriefZaCienki(text) && !prev) return false;
  if (/\[\[SZABLON:\w+\([^)]*\)\]\]/i.test(talk)) {
    return true;
  }
  if (/\[\[RYSUJ\]\]/i.test(talk)) {
    if (!prev && !pjTalkMaPlanDruku(talk)) return false;
    if (!prev && !pjUserMaMm(text) && !pjSzacunekZFotki(text)) return false;
    return true;
  }
  if (prev) return true;
  return false;
}

function pjLiczbaMm(s) {
  return parseFloat(String(s).replace(',', '.'));
}

function pjListaBryl(spec) {
  const b = ((spec && spec.bryly) || []).slice();
  ((spec && spec.czesci) || []).forEach(function (c) {
    (c.bryly || []).forEach(function (x) { b.push(x); });
  });
  return b;
}

function pjSpecPusteBryly(spec) {
  return specPusteBryly(spec);
}

function pjTekstNapisZZrodla(brief, talk) {
  const src = String(brief || '') + '\n' + String(talk || '');
  const q = src.match(/[„"]([^"„”]{8,80})["”]/);
  if (q) return q[1].trim();
  const first = String(brief || '').split(/\n/)[0].split(/[—]/)[0].trim();
  if (first && /urodzin|chrzest|napis|imienin|rocznic|topper/i.test(first)
      && first.length >= 8 && first.length <= 80) {
    return first.replace(/\s*[—].*$/, '').replace(/\s*-\s*napis.*$/i, '').trim();
  }
  return '';
}

/** Liczby mm z talku/briefu — SPEC ma przepisać 1:1, bez skalowania. */
function pjKontraktMm(talk, brief) {
  const src = [brief, talk].filter(Boolean).join('\n');
  const lines = [];
  function add(label, v) {
    if (!Number.isFinite(v)) return;
    lines.push('- ' + label + ': ' + (Math.round(v * 100) / 100));
  }
  const lit = src.match(/liter[yiaeę]\w*[^\d]{0,28}?(\d+(?:[.,]\d+)?)\s*mm/i)
    || src.match(/wysoko[sś][cć](?:\s+liter[yiaeę]\w*)?[^\d]{0,16}?(\d+(?:[.,]\d+)?)\s*mm/i);
  if (lit) add('napis wysokosc_mm (litery)', pjLiczbaMm(lit[1]));
  const nogi = src.match(/n[oó][zż]k\w*[^\d]{0,24}?(\d+(?:[.,]\d+)?)\s*mm/i);
  if (nogi) add('nogi_mm', pjLiczbaMm(nogi[1]));
  const szer = src.match(/(?:szerok\w*|ca[lł]o[sś][cć])[^\d]{0,28}?(\d+(?:[.,]\d+)?)\s*mm/i)
    || src.match(/ok\.\s*(\d+(?:[.,]\d+)?)\s*mm\s+szerok/i)
    || src.match(/(\d+(?:[.,]\d+)?)\s*mm\s+szerok/i);
  if (szer) add('max_szer_mm / szerokość', pjLiczbaMm(szer[1]));
  const seen = {};
  const re3 = /(\d+(?:[.,]\d+)?)\s*[×x]\s*(\d+(?:[.,]\d+)?)(?:\s*[×x]\s*(\d+(?:[.,]\d+)?))?\s*mm/gi;
  let m;
  while ((m = re3.exec(src))) {
    const a = pjLiczbaMm(m[1]), b = pjLiczbaMm(m[2]), c = m[3] != null ? pjLiczbaMm(m[3]) : null;
    const key = a + 'x' + b + (c != null ? 'x' + c : '');
    if (seen[key]) continue;
    seen[key] = true;
    lines.push('- gabaryt: ' + a + ' × ' + b + (c != null ? ' × ' + c : '') + ' mm');
  }
  const txt = pjTekstNapisZZrodla(brief, talk);
  if (txt) lines.push('- tekst napisu (cytat, nie skracać): "' + txt + '"');
  if (!lines.length) return '';
  return 'USTALENIA MM Z TALKU — przepisuj 1:1 do pól *_mm (jednostka milimetr, bez skalowania):\n' + lines.join('\n');
}

function pjWymusMmNaNapisie(spec, talk, brief) {
  const src = [brief, talk].filter(Boolean).join('\n');
  const lit = src.match(/liter[yiaeę]\w*[^\d]{0,28}?(\d+(?:[.,]\d+)?)\s*mm/i)
    || src.match(/wysoko[sś][cć](?:\s+liter[yiaeę]\w*)?[^\d]{0,16}?(\d+(?:[.,]\d+)?)\s*mm/i);
  const nogi = src.match(/n[oó][zż]k\w*[^\d]{0,24}?(\d+(?:[.,]\d+)?)\s*mm/i);
  const hTalk = lit ? pjLiczbaMm(lit[1]) : NaN;
  const nTalk = nogi ? pjLiczbaMm(nogi[1]) : NaN;
  const txt = pjTekstNapisZZrodla(brief, talk);
  const traktor = /traktor|wplec/i.test(src);
  pjListaBryl(spec).forEach(function (b) {
    const k = b && b.ksztalt;
    if (!k || k.typ !== 'napis') return;
    if (hTalk >= 20 && hTalk <= 50) k.wysokosc_mm = hTalk;
    if (nTalk >= 60 && nTalk <= 140) k.nogi_mm = nTalk;
    if (txt && (!k.tekst || String(k.tekst).trim().length + 2 < txt.length)) k.tekst = txt;
    if (traktor) k.wplec_traktor = true;
  });
  return spec;
}

function pjOdrzucPustePoRysuj(spec, talk) {
  if (!/\[\[RYSUJ\]\]/i.test(String(talk || ''))) return;
  if (pjSpecPusteBryly(spec)) {
    throw new Error('SPEC_INCOMPLETE: po [[RYSUJ]] wypełnij bryły z listy kształtów; jaskółczy ogon = kieszeń + luz 0,4; zakaz pustych brył.');
  }
}

function pjDomknijSpec(spec, talk, text) {
  pjWymusMmNaNapisie(spec, talk, text);
  const szacunek = pjSzacunekZFotki(text) && !pjUserMaMm(text);
  oznaczSzacunek(spec, { szacunek: szacunek, zmierzone: pjUserMaMm(text) && !szacunek });
  return spec;
}

function pjPokazResearch(query) {
  const el = $('pjResearch');
  if (!el) return;
  const wanna = /wann|rant|mydel|mydl|soap|przyss?awk/.test(foldPj(query));
  const q = wanna ? (query + ' bathtub soap dish suction cup mount') : query;
  const planFn = window.P2S && window.P2S.searchPlan;
  if (typeof planFn !== 'function') {
    el.hidden = false;
    el.innerHTML = '<p>Otwórz podobne modele ręcznie na Printables, MakerWorld i Thingiverse. Aplikacja nie pobiera STL.</p>';
    return;
  }
  const plan = planFn(q, 0);
  const links = (plan.links || []).map(function (l) {
    return '<a href="' + l.href + '" target="_blank" rel="noopener">' + escapeHtml(l.name) + '</a>';
  }).join(' · ');
  const extra = wanna
    ? '<p><a href="https://allegro.pl/listing?string=' + encodeURIComponent('przyssawka 40mm grzybek') + '" target="_blank" rel="noopener">Allegro: przyssawka 40 mm grzybek</a>'
      + ' · Qinuo QNSC-M40 (Ø40, T-head 13,5 mm, szyjka 8×2 mm)</p>'
    : '';
  el.hidden = false;
  el.innerHTML = '<p><b>Najpierw podobne modele i kubki</b> (wyszukiwanie, bez pobierania pliku):</p>'
    + '<p>' + links + '</p>'
    + extra
    + '<p class="tnote">EN: ' + escapeHtml(plan.en || q) + ' — STL ściągasz sam ze strony autora, jeśli licencja pozwala.</p>';
}

function pjOdrzucHakaProstego(spec, note) {
  const blob = foldPj([
    note,
    spec && spec.opis_slowny,
    spec && spec.uwagi_do_druku,
    spec && spec.nazwa,
    pjChatBlob()
  ].join(' '));
  if (!/okrag|round|wolnostoj|free.?stand/.test(blob)) return;
  const bryly = (spec && spec.bryly) || [];
  const czesci = spec && spec.czesci;
  const all = czesci && czesci.length
    ? czesci.reduce((a, c) => a.concat(c.bryly || []), bryly.slice())
    : bryly;
  const ids = all.map(b => b.id || '').join(' ');
  const hasRect = /hak_zewnetrzny|siodlo_rantu/.test(ids)
    && all.some(b => (b.id === 'siodlo_rantu' || b.id === 'hak_zewnetrzny')
      && b.ksztalt && b.ksztalt.typ === 'prostopadloscian');
  const hasPrzysawk = /przyss?awk|keyhole|kieszen_kubka/.test(ids)
    || /przyss?awk/.test(blob);
  const hasObrot = all.some(b => b.ksztalt && b.ksztalt.typ === 'obrot');
  if (hasRect && !hasObrot && !hasPrzysawk) {
    throw new Error('Wanna okrągła: prostokątny hak nie obejmie rantu. Zaproponuj przyssawki (kieszeń pod konkretny kubek) albo klamrę łukową.');
  }
}

function pjPilnujUstalenSpec(spec, context) {
  const czesci = (spec && spec.czesci) || [];
  const bryly = ((spec && spec.bryly) || []).concat(
    czesci.reduce((a, c) => a.concat(c.bryly || []), [])
  );
  const cechy = ((spec && spec.cechy) || []).concat(
    czesci.reduce((a, c) => a.concat(c.cechy || []), [])
  );
  const pytania = (spec && spec.pytania) || [];
  if (bryly.length && !['PLA', 'PETG', 'ABS', 'TPU'].includes(spec.material)) {
    throw new Error('Materiał SPEC musi być jednym z: PLA, PETG, ABS, TPU — nie zgaduj własnej nazwy.');
  }
  if (!bryly.length && pytania.length) {
    if (/\[\[RYSUJ\]\]|PO RYSUJ Z ROZMOWY/i.test(String(context || ''))) {
      throw new Error('SPEC_INCOMPLETE: po [[RYSUJ]] wypełnij bryły z listy kształtów; jaskółczy ogon = kieszeń + luz 0,4; zakaz pustych brył.');
    }
    return;
  }
  const blob = foldPj([
    context,
    spec && spec.nazwa,
    spec && spec.opis_slowny,
    spec && spec.uwagi_do_druku,
    pjChatBlob()
  ].join(' '));
  const bezWiercenia = /bez wierc|nic nie wierc|nie wierc|przyss?awk/.test(blob);
  const wanna = /wann|rant|mydel|mydl/.test(blob);
  const cechyOtworowe = cechy.filter(c => c && (c.typ === 'otwor' || c.typ === 'otwor_pod_wkladke'));
  if (wanna && bezWiercenia && cechyOtworowe.length) {
    throw new Error(
      'SPEC niezgodny z ustaleniami: przyssawki/bez wiercenia nie używają cech otwor. ' +
      'Keyhole i szczeliny wykonaj wyłącznie jako bryły odejmowane; nie dodawaj cech, których człowiek nie wybrał.'
    );
  }
  if (bryly.length) {
    if (czesci.length) {
      czesci.forEach(cz => {
        walidujPlanDruku({
          orientacja_druku: (cz && cz.orientacja_druku) || spec.orientacja_druku,
          podpory: (cz && cz.podpory) || spec.podpory,
          brim: (cz && cz.brim) || spec.brim
        });
      });
    } else {
      walidujPlanDruku(spec);
    }
  }
}

function rysujCztery(mesh, bbox) {
  const keys = ['izo', 'przod', 'bok', 'gora'];
  const ids = ['pjIzo', 'pjPrzod', 'pjBok', 'pjGora'];
  const lab = ['pjLabIzo', 'pjLabPrzod', 'pjLabBok', 'pjLabGora'];
  keys.forEach((k, i) => {
    const c = $(ids[i]); if (!c) return;
    const ctx = c.getContext('2d');
    rysuj(ctx, rzutuj(mesh, WIDOKI[k], c.width, c.height));
    const lb = $(lab[i]);
    if (lb) lb.textContent = WIDOKI[k].etykieta + ' · ' + etykietaGabarytu(k, bbox);
  });
  const bb = $('pjBbox');
  if (bb) bb.textContent = bbox.x.toFixed(0) + ' × ' + bbox.y.toFixed(0) + ' × ' + bbox.z.toFixed(0) + ' mm';
}

function pokazDecl(dekl, mesh) {
  const el = $('pjDecl'); if (!el) return;
  try { localStorage.setItem(DECL_KEY, JSON.stringify(dekl)); } catch (e) {}
  if (typeof window.aDeclHtml === 'function') {
    el.innerHTML = window.aDeclHtml(mesh.bbox, [{ a: { watertight: true } }]);
  } else {
    el.innerHTML = '<p>X ' + mesh.bbox.x.toFixed(2) + ' · Y ' + mesh.bbox.y.toFixed(2) + ' · Z ' + mesh.bbox.z.toFixed(2) + ' mm</p>';
  }
  const wk = (dekl.wymiary_krytyczne || []).map(w =>
    '<p>' + escapeHtml(w.nazwa) + ': ' + Number(w.wartosc_mm).toFixed(2).replace('.', ',') + ' mm</p>').join('');
  if (wk) el.innerHTML += wk;
}

function syncExport(werdykt) {
  const btn = $('pjDl3mf'), anal = $('pjAnal'), mimo = $('pjMimo');
  const eksper = last && (last.eksperymentalny || werdyktEksperymentalny(last.spec));
  const ok = werdykt && werdykt.eksportOk && !eksper;
  const force = mimo && mimo.checked;
  if (btn) {
    btn.disabled = !(last && last.mesh) || (!ok && !force && !eksper);
    if (eksper && last && last.mesh) {
      btn.disabled = false;
      btn.textContent = 'Pobierz 3MF (eksperymentalny)';
    } else if (btn) {
      btn.textContent = 'Pobierz 3MF';
    }
  }
  if (anal) anal.disabled = !(last && last.mesh);
}

function rysujAktualna() {
  if (!last) return;
  const r = (last.czesci && last.czesci[lastIdx]) || last;
  if (!r || !r.mesh) return;
  rysujCztery(r.mesh, r.mesh.bbox);
  pokazDecl(r.deklaracja || last.deklaracja, r.mesh);
}

function fillCzesciSwitch() {
  const box = $('pjCzesciSwitch'); if (!box) return;
  const n = last && last.czesci ? last.czesci.length : 0;
  if (n < 2) { box.hidden = true; box.innerHTML = ''; return; }
  box.hidden = false;
  box.innerHTML = last.czesci.map((c, i) => {
    const naz = (c.spec && c.spec.nazwa) || ('część ' + (i + 1));
    return '<button type="button" class="btn' + (i === lastIdx ? ' pri' : '') + '" data-i="' + i + '">'
      + escapeHtml(naz) + '</button>';
  }).join('');
}

async function bootEngine() {
  if (engineOk) return true;
  if (enginePromise) return enginePromise;
  const msg = $('pjEngineMsg');
  engineTried = true;
  enginePromise = (async () => {
    try {
      if (!globalThis.__P2S_WASM) {
        const r = await fetch('./engine/manifold.wasm', { method: 'HEAD' });
        if (!r.ok) throw new Error('brak wasm');
      }
      await initEngine();
      if (globalThis.__P2S_SCHEMA) schema = globalThis.__P2S_SCHEMA;
      else schema = await (await fetch('./spec-v1.schema.json')).json();
      engineOk = true;
      if (msg) msg.hidden = true;
      return true;
    } catch (e) {
      engineOk = false;
      enginePromise = null;
      if (msg) {
        msg.hidden = false;
        msg.textContent = location.protocol === 'file:'
          ? 'Zakładka Projekt nie wystartowała (silnik). Reszta przewodnika działa normalnie.'
          : 'Zakładka Projekt wymaga plików silnika obok przewodnika. Reszta przewodnika działa normalnie.';
      }
      return false;
    }
  })();
  return enginePromise;
}

function orWiadomosc(data) {
  const msg = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) return '';
  let c = msg.content;
  if (Array.isArray(c)) {
    c = c.map(function (p) {
      if (typeof p === 'string') return p;
      return (p && (p.text || p.content)) || '';
    }).join('');
  } else if (c && typeof c === 'object') {
    c = c.text || c.content || '';
  }
  return String(c || '').trim();
}

/** Talk może trwać 5 min; SPEC (długi agent Opus) 10 min — nie 180 s. */
const PJ_TIMEOUT_TALK_MS = 300000;
const PJ_TIMEOUT_SPEC_MS = 600000;
const PJ_TELE_KEY = 'p2s.telemetria.v1';

function pjMetaWersji() {
  const m = (typeof window !== 'undefined' && window.__P2S_META) || {};
  return {
    wersja: m.wersja || (typeof window !== 'undefined' && window.P2S_VER_NAME) || '4.2.26',
    stamp: m.stamp || m.cache || '',
    talk_ms: m.talk_ms || PJ_TIMEOUT_TALK_MS,
    spec_ms: m.spec_ms || PJ_TIMEOUT_SPEC_MS
  };
}

function pjTele(ev) {
  const row = Object.assign({
    when: Date.now(),
    wersja: pjMetaWersji().wersja,
    stamp: pjMetaWersji().stamp,
    profil: pjProfil()
  }, ev || {});
  try {
    const prev = JSON.parse(get(PJ_TELE_KEY, '[]') || '[]');
    const arr = Array.isArray(prev) ? prev : [];
    arr.push(row);
    set(PJ_TELE_KEY, JSON.stringify(arr.slice(-80)));
  } catch (e) {}
  if (typeof window !== 'undefined') {
    window.__P2S_LAST_TELE = row;
    const log = window.__P2S_TELE_LOG || (window.__P2S_TELE_LOG = []);
    log.push(row);
  }
  try {
    const bits = [
      row.rola || 'or',
      row.model ? String(row.model).split('/').pop() : '',
      row.ms != null ? (Math.round(row.ms / 100) / 10 + 's') : '',
      row.http ? ('HTTP ' + row.http) : '',
      row.retry ? ('retry ' + row.retry) : '',
      row.schema || '',
      row.chunk_gate ? ('chunk_gate=' + row.chunk_gate) : '',
      row.chunk_repair_attempt ? ('chunk_repair_attempt=' + row.chunk_repair_attempt) : '',
      row.chunk_repair_result ? ('chunk_repair_result=' + row.chunk_repair_result) : '',
      row.wynik || ''
    ].filter(Boolean);
    if ((row.wynik && row.wynik !== 'ok') || row.chunk_gate) {
      chatLine('ai', 'Log: ' + bits.join(' · '));
    }
  } catch (e2) {}
  return row;
}

function pjJestOpus(id) {
  return /claude-opus-5/i.test(String(id || ''));
}

function pjToTimeout(e, ms, model) {
  const m = String((e && e.name) || '') + ' ' + String((e && e.message) || e);
  if (/AbortError|aborted|abort/i.test(m)) {
    return new Error('TIMEOUT ' + ms + 'ms ' + (model || ''));
  }
  return e;
}

function pjSleep(ms) {
  return new Promise(function (ok) { setTimeout(ok, ms); });
}

function orFinishReason(data) {
  const ch = data && data.choices && data.choices[0];
  return (ch && ch.finish_reason) || '';
}

function pjBladPrzyciecia(finishReason, limit) {
  const e = new Error(komunikatPrzyciecia('', finishReason, limit));
  e.przyciete = true;
  e.finishReason = finishReason || 'length';
  return e;
}

/**
 * Ciężkie SPEC-i tac: zwykły POST bywa ucinany po ~3,5 min bez żadnego HTTP.
 * Strumień zbieramy w całości do buforu i dopiero potem parsujemy JSON.
 */
async function orCallStrumien(body, timeoutMs) {
  const k = key();
  if (!k) throw new Error('Brak klucza OpenRouter');
  const ms = timeoutMs || PJ_TIMEOUT_SPEC_MS;
  const ac = new AbortController();
  const t = setTimeout(function () { ac.abort(); }, ms);
  const parser = nowyParserSSE();
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + k,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'HTTP-Referer': location.origin || 'https://localhost',
        'X-Title': 'Przewodnik P2S Projekt'
      },
      body: JSON.stringify(Object.assign({}, body, { stream: true, usage: { include: true } })),
      signal: ac.signal
    });
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.text()).slice(0, 180); } catch (e0) {}
      const err = new Error('HTTP ' + res.status + ' ' + msg);
      err.http = res.status;
      err.retryable = orHttpRetryowalny(err);
      throw err;
    }
    if (!res.body || !res.body.getReader) throw new Error('Brak strumienia w odpowiedzi');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.dopisz(dec.decode(value, { stream: true }));
    }
    const out = parser.domknij();
    if (out.finishReason === 'length') throw pjBladPrzyciecia('length', body.max_tokens);
    if (!out.tresc) throw new Error('Pusta odpowiedź modelu (' + (body.model || '') + ')');
    pjTele({
      rola: 'spec-stream', model: body.model, wynik: 'ok',
      tokeny_myslenie: out.tokenyMyslenie, tokeny_wyjscie: out.tokenyWyjscie
    });
    return out.tresc;
  } catch (e) {
    const stan = parser.stan();
    const err = pjToTimeout(e, ms, body && body.model);
    if (!err.przyciete && stan.tresc && !/HTTP\s/.test(String(err.message || ''))) {
      /* strumień urwany w połowie JSON — to przycięcie, nie „model nie umie” */
      err.przyciete = true;
      err.finishReason = 'urwany-strumien';
    }
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function orCall(body, timeoutMs) {
  if (body && body.stream) return await orCallStrumien(body, timeoutMs);
  const k = key();
  if (!k) throw new Error('Brak klucza OpenRouter');
  const ms = timeoutMs || PJ_TIMEOUT_TALK_MS;
  const ac = new AbortController();
  const t = setTimeout(function () { ac.abort(); }, ms);
  const t0 = Date.now();
  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + k,
        'Content-Type': 'application/json',
        'HTTP-Referer': location.origin || 'https://localhost',
        'X-Title': 'Przewodnik P2S Projekt'
      },
      body: JSON.stringify(body),
      signal: ac.signal
    });
    let data = {};
    const raw = await res.text();
    try { data = raw ? JSON.parse(raw) : {}; } catch (pe) {
      data = { error: { message: String(raw).slice(0, 180) } };
    }
    if (!res.ok) {
      const err = new Error('HTTP ' + res.status + ' '
        + ((data && data.error && data.error.message) || res.statusText || '').slice(0, 180));
      err.http = res.status;
      err.retryable = orHttpRetryowalny(err);
      throw err;
    }
    if (orFinishReason(data) === 'length') throw pjBladPrzyciecia('length', body.max_tokens);
    const c = orWiadomosc(data);
    if (!c) throw new Error('Pusta odpowiedź modelu (' + (body.model || '') + ')');
    return c;
  } catch (e) {
    throw pjToTimeout(e, ms, body && body.model);
  } finally {
    clearTimeout(t);
    try {
      const elapsed = Date.now() - t0;
      if (elapsed > 1000) {
        /* pełny wpis robi orCallLancuch (zna rolę i retry) */
        void elapsed;
      }
    } catch (e3) {}
  }
}

async function orCallLancuch(body, lancuch, timeoutMs, rola) {
  const ids = (lancuch && lancuch.length) ? lancuch : [body.model];
  let lastErr = null;
  const seen = {};
  const rolaNazwa = rola || (timeoutMs === PJ_TIMEOUT_SPEC_MS ? 'spec' : 'talk');
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id || seen[id]) continue;
    seen[id] = true;
    const b = Object.assign({}, body, {
      model: id,
      max_tokens: body.max_tokens || 32000,
      reasoning: pjReasoning(id, body.reasoning)
    });
    let httpProba = 0;
    let timeoutRetried = false;
    for (;;) {
      const t0 = Date.now();
      try {
        const txt = await orCall(b, timeoutMs);
        pjTele({
          rola: rolaNazwa, model: id, ms: Date.now() - t0,
          retry: httpProba + (timeoutRetried ? 1 : 0),
          wynik: 'ok', schema: '', http: 0
        });
        return txt;
      } catch (e) {
        lastErr = e;
        const msg = String((e && e.message) || e);
        const http = e && e.http;
        const msCall = Date.now() - t0;
        if (orHttpRetryowalny(e)) {
          const wait = orBackoffMs(httpProba);
          pjTele({
            rola: rolaNazwa, model: id, ms: msCall, http: http || 0,
            retry: httpProba, wynik: 'http-' + (http || 'retry')
          });
          if (wait != null) {
            try {
              chatLine('ai', 'OpenRouter HTTP ' + (http || '?')
                + ' — czekam ' + (wait / 1000) + ' s i powtarzam ten sam mózg (nie Grok).');
            } catch (e2) {}
            httpProba += 1;
            await pjSleep(wait);
            continue;
          }
        }
        if (pjJestOpus(id) && orTimeoutLubPusty(e) && !timeoutRetried) {
          timeoutRetried = true;
          pjTele({
            rola: rolaNazwa, model: id, ms: msCall, http: 0,
            retry: 1, wynik: 'timeout-retry'
          });
          continue;
        }
        const brakSrodkow = orBrakSrodkow(e);
        pjTele({
          rola: rolaNazwa, model: id, ms: msCall, http: http || 0,
          retry: httpProba,
          wynik: brakSrodkow ? 'OR_BRAK_SRODKOW' : (http ? ('http-' + http) : 'fail')
        });
        if (e && e.przyciete) throw e;
        // Pusty portfel dotyczy konta, nie modelu — łańcuch zapasowy nic tu nie da,
        // więc kończymy od razu, także w profilu eksperymentalnym.
        if (brakSrodkow) throw new Error(orKomunikatBrakSrodkow(msg));
        if (!orWolnoLancuchZapasu(pjProfil())) {
          if (orHttpRetryowalny(e) || orTimeoutLubPusty(e)) {
            throw new Error(orKomunikatBusy(http, msg));
          }
          throw e;
        }
        try { chatLine('ai', 'Mózg ' + id + ' padł — następny z łańcucha (profil eksperymentalny).'); } catch (e2) {}
        break;
      }
    }
  }
  throw lastErr || new Error('Żaden model mózgu nie odpowiedział');
}

function parseSpec(txt) {
  const s = String(txt).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : s;
  const i = raw.indexOf('{'), j = raw.lastIndexOf('}');
  if (i < 0 || j <= i) throw new Error('Brak JSON w odpowiedzi SPEC');
  return JSON.parse(raw.slice(i, j + 1));
}

function pjWalidujSpecWejscie(spec) {
  if (!schema) return spec;
  walidujSpecAlboRzuc(spec, schema);
  return spec;
}

async function pjOdpowiedzSpec(body) {
  const lancuch = lancuchMozgu(body.model, MOZGI_SPEC);
  const t = PJ_TIMEOUT_SPEC_MS;
  if (body && body.stream) {
    /* strumień: tylko json_object — schema pilnuje walidator po domknięciu */
    return await orCallLancuch(Object.assign({}, body, {
      response_format: { type: 'json_object' }
    }), lancuch, t, 'spec');
  }
  if (schema) {
    try {
      return await orCallLancuch(Object.assign({}, body, {
        response_format: { type: 'json_schema', json_schema: { name: 'spec_v1', strict: true, schema: schema } }
      }), lancuch, t, 'spec');
    } catch (e) {
      /* OpenRouter bywa, że odrzuca json_schema — SPEC i tak ma powstać. */
      if (/OR_BUSY|TIMEOUT/i.test(String((e && e.message) || e))) throw e;
    }
  }
  return await orCallLancuch(Object.assign({}, body, { response_format: { type: 'json_object' } }), lancuch, t, 'spec');
}

function pjBodySpecCzesci(userContent, prof, maxTok, stream) {
  const b = {
    model: pjModelRoli('spec'),
    messages: [
      { role: 'system', content: pjSysSpec() },
      { role: 'user', content: userContent }
    ],
    max_tokens: maxTok || (prof && prof.maxTokens) || 26000,
    reasoning: (prof && prof.reasoningTokens)
      ? { max_tokens: prof.reasoningTokens }
      : { effort: 'max' }
  };
  if (stream) b.stream = true;
  return b;
}

/**
 * Jeden kawałek SPEC. Dwa osobne stany błędu, każdy z najwyżej jedną powtórką:
 * przycięcie (wyższy limit tokenów) i niepoprawny SPEC (feedback walidatora).
 */
async function pjSpecJednaTura(userContent, talk, text, opts) {
  opts = opts || {};
  const prof = opts.profil || profilShardu(opts.shard || '');
  const stream = !!prof.stream;
  async function tura(body) {
    return splaszczShardDo10(pjDomknijSpec(parseSpec(await pjOdpowiedzSpec(body)), talk, text));
  }
  let spec;
  try {
    spec = await tura(pjBodySpecCzesci(userContent, prof, prof.maxTokens, stream));
  } catch (e) {
    if (!czyPrzycieta(e && e.finishReason, e)) throw e;
    pjTele({
      rola: 'spec-shard', wynik: 'truncated', shard: opts.shard || '',
      retry: 1, http: 0
    });
    try {
      chatLine('ai', komunikatPrzyciecia(opts.shard, e && e.finishReason, prof.maxTokens)
        + ' Powtarzam z limitem ' + prof.maxTokensRetry + '.');
    } catch (e2) {}
    spec = await tura(pjBodySpecCzesci(userContent, prof, prof.maxTokensRetry, stream));
  }
  let preview;
  try {
    pjOdrzucPustePoRysuj(spec, '[[RYSUJ]]');
    pjWalidujSpecWejscie(spec);
    if (opts.shard) preview = sprawdzGeometrieShardu(spec, buildAndGate);
  } catch (first) {
    const msg1 = String((first && first.message) || first);
    const popraw = Object.assign(
      pjBodySpecCzesci(userContent, prof, prof.maxTokensRetry, stream),
      {
        messages: [
          { role: 'system', content: pjSysSpec() },
          {
            role: 'user',
            content: userContent
              + '\n\nPOPRZEDNI NIEPOPRAWNY SPEC:\n' + JSON.stringify(spec)
              + '\n\nBŁĄD WALIDATORA:\n' + msg1
              + '\n\nOddaj cały poprawiony SPEC 1.0 tej jednej części. Min. 1 bryła. Bez pola czesci.'
          }
        ]
      }
    );
    spec = await tura(popraw);
    pjOdrzucPustePoRysuj(spec, '[[RYSUJ]]');
    pjWalidujSpecWejscie(spec);
    if (opts.shard) preview = sprawdzGeometrieShardu(spec, buildAndGate);
  }
  if (opts.shard) {
    const out = await processShardWithRepair(spec, {
      preview: preview,
      buduj: buildAndGate,
      shardId: opts.shard,
      walidujSchema: function (s) {
        pjOdrzucPustePoRysuj(s, '[[RYSUJ]]');
        pjWalidujSpecWejscie(s);
      },
      log: function (s) { try { chatLine('ai', s); } catch (e2) {} },
      tele: function (ev) {
        pjTele(Object.assign({
          rola: 'spec-shard', shard: opts.shard, stream: stream
        }, ev || {}));
      },
      napraw: async function (zly, fg) {
        const popraw = Object.assign(
          pjBodySpecCzesci(userContent, prof, prof.maxTokensRetry, stream),
          {
            messages: [
              { role: 'system', content: pjSysSpec() },
              {
                role: 'user',
                content: userContent + '\n\n' + tekstNaprawyKawalka(zly, fg, opts.shard)
              }
            ]
          }
        );
        return await tura(popraw);
      }
    });
    return out.spec;
  }
  return spec;
}

async function pjPlanCzesci(talk, text) {
  const def = planCzesciDomyslny(text + '\n' + talk);
  const body = {
    model: pjModelRoli('spec'),
    messages: [
      {
        role: 'system',
        content: 'Oddaj TYLKO JSON planu, bez geometrii. Kształt: {"nazwa":"ociekacz","material":"PETG","czesci":[{"id":"taca-L","nazwa":"taca-L","rola":"base"}]}. 2–8 części. Ociekacz 550×240 = 3 tace + 2 stelaże + koszyk. Zasuwa = korpus + rygiel. Żadnych brył.'
      },
      { role: 'user', content: 'Brief:\n' + text + '\n\nUstalenia:\n' + pjObetnijZnacznik(talk) }
    ],
    max_tokens: 2000,
    reasoning: { effort: 'high' }
  };
  try {
    const txt = await orCallLancuch(Object.assign({}, body, { response_format: { type: 'json_object' } }),
      lancuchMozgu(body.model, MOZGI_SPEC), 120000, 'spec-plan');
    const j = parseSpec(txt);
    if (walidujPlanCzesci(j)) {
      return { nazwa: j.nazwa, material: j.material || 'PETG', czesci: j.czesci };
    }
  } catch (e) {
    try { chatLine('ai', 'Plan części z mózgu padł — biorę podział z briefu.'); } catch (e2) {}
  }
  if (!def.length) throw new Error('SHARD: nie wiem jak pociąć ten projekt');
  return { nazwa: /zasuw|rygiel/.test(foldPj(text + talk)) ? 'zasuwa' : 'ociekacz', material: 'PETG', czesci: def };
}

async function pjSpecSharded(talk, text, userB) {
  chatLine('ai', 'Duży projekt — tnę SPEC na kawałki (osobny call na część). PASS całości tylko gdy wszystkie kawałki przejdą.');
  const plan = await pjPlanCzesci(talk, text);
  const zlozone = [];
  const bledy = [];
  for (let i = 0; i < plan.czesci.length; i++) {
    const p = plan.czesci[i];
    const prof = profilShardu(p);
    chatLine('ai', 'Shard ' + (i + 1) + '/' + plan.czesci.length + ': ' + (p.nazwa || p.id)
      + (prof.stream ? ' (strumień, ' : ' (zwykły POST, ') + prof.maxTokens + ' tok.)');
    const user = userB
      + '\n\nSKŁADASZ TYLKO CZĘŚĆ id=' + p.id + ' nazwa=' + p.nazwa
      + (p.hint ? (' — ' + p.hint) : (p.rola ? (' (' + p.rola + ')') : ''))
      + '.\nSPEC 1.0: bryly na wierzchu, min. 1 bryła. NIE dodawaj pola czesci. Gabaryt tej części ≤250 mm.'
      + (zlozone.length ? ('\nJuż złożone (nie powtarzaj): ' + zlozone.map(function (c) { return c.nazwa; }).join(', ')) : '');
    try {
      const cz = await pjSpecJednaTura(user, talk, text, { profil: prof, shard: p.id });
      cz.nazwa = cz.nazwa || p.nazwa;
      zlozone.push(cz);
      pjTele({ rola: 'spec-shard', wynik: 'ok', shard: p.id, stream: prof.stream });
    } catch (e) {
      const msg = String((e && e.message) || e);
      const przyciete = czyPrzycieta(e && e.finishReason, e);
      bledy.push({ id: p.id, err: msg, powod: przyciete ? 'SHARD_TRUNCATED' : 'SHARD_FAIL' });
      pjTele({
        rola: 'spec-shard', shard: p.id, stream: prof.stream,
        wynik: przyciete ? 'truncated-fail' : 'fail'
      });
      chatLine('ai', 'Shard ' + p.id + (przyciete ? ' urwany (SHARD_TRUNCATED): ' : ' padł: ') + msg.slice(0, 220));
    }
  }
  const spec = zlepSpecCzesci({
    nazwa: plan.nazwa,
    material: plan.material,
    uwagi_do_druku: bledy.length
      ? ('SHARD niekompletny: ' + bledy.map(function (b) { return b.id; }).join(', '))
      : 'sharded OK'
  }, zlozone);
  spec._shardBledy = bledy;
  return spec;
}

async function zbuduj(spec, note, prev, context, opts) {
  opts = opts || {};
  pjWalidujSpecWejscie(spec);
  pjPilnujUstalenSpec(spec, context || note);
  pjOdrzucHakaProstego(spec, note);
  const r = buildAndGate(spec);
  if (r.pytania && r.pytania.length) {
    const lista = $('pjDrukLista');
    if (lista) { lista.hidden = true; lista.innerHTML = ''; }
    setWarn({ wpisy: r.pytania.map(t => ({ poziom: 'ostrzezenie', kod: 'PYTANIE', tekst: t })) });
    $('pjPytanieWrap').hidden = false;
    $('pjPytanie').textContent = r.pytania[0];
    chatLine('ai', r.pytania.join(' '));
    return r;
  }
  const bledyBramki = ((r.werdykt && r.werdykt.wpisy) || []).filter(w => w.poziom === 'blad');
  if (bledyBramki.length) {
    throw new Error(bledyBramki.map(w => w.kod + ': ' + w.tekst).join('; '));
  }
  if (typeof window !== 'undefined' && window.P2S
      && typeof window.P2S.flagaWizjaProjekt === 'function'
      && window.P2S.flagaWizjaProjekt()
      && typeof window.P2S.ocenWizjaProjekt === 'function'
      && r.mesh) {
    const wiz = window.P2S.ocenWizjaProjekt(r.mesh, spec);
    if (wiz && wiz.kody && wiz.kody.length) {
      throw new Error(wiz.kody.map(function (k) {
        return k + ': ' + ((wiz.teksty && wiz.teksty[k]) || k);
      }).join('; '));
    }
  }
  $('pjPytanieWrap').hidden = true;
  last = r;
  lastIdx = 0;
  last.eksperymentalny = werdyktEksperymentalny(r.spec) || !!opts.niepelnyShard;
  if (opts.niepelnyShard) last.shardBledy = opts.shardBledy || [];
  if (opts.niepelnyShard) {
    chatLine('ai', '3MF z niepełnych shardów — nie PASS (padły: '
      + (last.shardBledy || []).map(function (b) { return b.id; }).join(', ') + ').');
    pjTele({ rola: 'spec', wynik: 'eksperymentalny', schema: 'ok' });
  } else if (last.eksperymentalny) {
    chatLine('ai', '3MF profil eksperymentalny (derivedFrom=estimated) — to nie jest PASS.');
    pjTele({ rola: 'spec', wynik: 'eksperymentalny', schema: 'ok' });
  } else {
    pjTele({ rola: 'spec', wynik: 'pass', schema: 'ok' });
  }
  if (prev) {
    const d = specDiff(prev, r.spec);
    const box = $('pjDiff');
    if (box) {
      box.hidden = false;
      const items = d.length
        ? d.map(x => '<li>' + escapeHtml(x.path) + ': ' + escapeHtml(JSON.stringify(x.from)) + ' → ' + escapeHtml(JSON.stringify(x.to)) + '</li>').join('')
        : '<li>brak zmian w polach</li>';
      box.innerHTML = '<b>Zmiany SPEC</b><ul>' + items + '</ul><p>reszta bez zmian</p>';
    }
  }
  rysujAktualna();
  fillCzesciSwitch();
  const werdyktOstrz = pjOstrzCienkieSciankiSpec(r.spec, r.werdykt);
  if (werdyktOstrz !== r.werdykt) r.werdykt = werdyktOstrz;
  setWarn(r.werdykt);
  syncExport(r.werdykt);
  pushHist({ spec: r.spec, deklaracja: r.deklaracja, note: note || '', when: Date.now() });
  if (r.spec.uwagi_do_druku) chatLine('ai', r.spec.uwagi_do_druku);
  pokazCheckliste(r.spec, r.werdykt);
  pjWlaczPrzerobTo(!!r.mesh);
  try { await pjZapiszNitke(); } catch (e) {}
  return r;
}

async function pjRozmowaZSzukaniem(text, imgs) {
  const photos = imgs || [];
  const talkId = pjModelRoli('talk');
  const lancuch = lancuchMozgu(talkId, MOZGI_TALK);
  let userContent = (window.__p2sWzorTekst ? (window.__p2sWzorTekst + '\n\n') : '') + text
    + '\n\nKontekst rozmowy:\n' + pjChatBlob().slice(-2500);
  try {
    const baza = await pjKontekstNauki(text);
    if (baza) userContent += '\n\n' + baza;
  } catch (e) { /* brak packa = bez RAG */ }
  if (photos.length && modelCzytaObraz(talkId)) {
    userContent = trescZZdjeciami(userContent, photos);
  }
  const messages = [
    { role: 'system', content: pjSysTalk() },
    { role: 'user', content: userContent }
  ];
  let talk = await orCallLancuch({ model: talkId, messages, max_tokens: 16000 }, lancuch, PJ_TIMEOUT_TALK_MS, 'talk');
  if (pjWymagaSzukania(text) && !wyciagnijSzukaj(talk)) {
    messages.push({ role: 'assistant', content: talk });
    messages.push({
      role: 'user',
      content: 'MARKA/ELEKTRONIKA: w tej turze tylko [[SZUKAJ]] hasło EN (Printables, wymiary PCB/obudowy). Zakaz [[RYSUJ]] i atrapy.'
    });
    talk = await orCallLancuch({ model: talkId, messages, max_tokens: 8000 }, lancuch, PJ_TIMEOUT_TALK_MS, 'talk');
  }
  let n = 0;
  while (n < 3) {
    const q = wyciagnijSzukaj(talk);
    if (!q) break;
    n += 1;
    chatLine('ai', 'Szukam: ' + q);
    let pack;
    try {
      pack = await szukajSieci(q);
    } catch (e) {
      pack = { ok: false, powod: (e && e.message) || 'błąd', tekst: '' };
    }
    messages.push({ role: 'assistant', content: talk });
    messages.push({ role: 'user', content: tekstWynikowSzukania(pack) });
    talk = await orCallLancuch({ model: talkId, messages, max_tokens: 16000 }, lancuch, PJ_TIMEOUT_TALK_MS, 'talk');
  }
  return talk;
}

async function zrob() {
  if (pjOriginFile()) {
    chatLine('ai', PJ_FILE_ORIGIN_MSG);
    return;
  }
  const raw = ($('pjIn').value || '').trim();
  const imgs = pjPendingImgs.slice();
  if (!raw && !imgs.length) return;
  const text0 = normalizujJednostki(raw || (imgs.length ? 'jak na zdjęciu' : ''));
  chatLine('me', text0 + (imgs.length ? ' [zdjęcie ×' + imgs.length + ']' : ''));
  $('pjIn').value = '';
  pjPendingImgs = [];
  pjRysujMiniaturki();
  const hintEl = $('pjVisionHint');
  if (hintEl) hintEl.hidden = true;
  pjPokazResearch(text0);
  if (!key()) {
    chatLine('ai', 'Brak klucza API — wklej SPEC ręcznie poniżej. Budowanie, podgląd i 3MF działają offline. Linki do podobnych modeli są powyżej.');
    $('pjSpec').focus();
    return;
  }
  const meta = pjMetaWersji();
  chatLine('ai', 'Mózg: ' + pjModelRoli('talk') + ' · reasoning max · profil ' + pjProfil()
    + ' · talk ' + (PJ_TIMEOUT_TALK_MS / 60000) + ' min / SPEC ' + (PJ_TIMEOUT_SPEC_MS / 60000)
    + ' min · ' + meta.wersja + (meta.stamp ? (' · ' + meta.stamp) : '') + '.');
  try {
    let text = text0;
    if (imgs.length) {
      const talkId = pjModelRoli('talk');
      if (uzyjFlashDoOpisu(talkId)) {
        chatLine('ai', HINT_BEZ_WIZJI);
        try {
          const opis = await pjOpisZdjeciaFlash(imgs);
          if (opis) {
            text = 'Opis zdjęcia (Flash — kształt, NIE mm; szacunek jeśli coś wygląda na wymiar):\n'
              + opis + '\n\n' + text;
            chatLine('ai', 'Opis z Flash (nie jest pomiarem):\n' + opis);
          }
        } catch (ve) {
          chatLine('ai', 'Nie odczytałem zdjęcia przez Flash. Opisz klamkę/drzwi słowami i podaj mm suwmiarką.');
        }
      }
    }
    const talk = await pjRozmowaZSzukaniem(text, uzyjFlashDoOpisu(pjModelRoli('talk')) ? [] : imgs);
    chatLine('ai', pjObetnijZnacznik(talk));
    const prev = last && last.spec;
    if (/\[\[SZUKAJ\]\]/i.test(talk) && !pjGotoweDoSpec(talk, text, prev)) {
      chatLine('ai', 'Szukanie nie domknęło się — dopytuję Ciebie o pomiary i sposób.');
    }
    if (/\[\[RYSUJ\]\]/i.test(talk) && !prev && !pjTalkMaPlanDruku(talk)) {
      chatLine('ai', 'Zanim złożę rysunek, dopisz: ORIENTACJA (która ściana na płycie), PODPORY (tak/nie + typ), BRIM (tak/nie).');
    }
    if (/\[\[RYSUJ\]\]/i.test(talk) && !prev && !pjUserMaMm(text) && !pjSzacunekZFotki(text)) {
      chatLine('ai', 'Zanim złożę rysunek, podaj milimetry suwmiarką (grubość, Ø, rozstaw). Nie zgaduję.');
    }
    if (/\[\[RYSUJ\]\]/i.test(talk) && pjSzacunekZFotki(text) && !pjUserMaMm(text)) {
      chatLine('ai', 'Szacunek z fotki (derivedFrom=estimated) — 3MF eksperymentalny, nie PASS.');
    }
    if (!pjGotoweDoSpec(talk, text, prev)) return;
    if (!(await bootEngine())) return;
    const wzor = window.__p2sWzorTekst || '';
    window.__p2sWzorTekst = '';
    const kontrakt = pjKontraktMm(talk, text);
    let userB = prev
      ? ('POPRZEDNI SPEC:\n' + JSON.stringify(prev) + '\n\nPROŚBA O ZMIANĘ:\n' + text +
        '\n\nZwróć CAŁY SPEC z naniesioną zmianą. Zmień WYŁĄCZNIE to, o co proszono. Każde inne pole ma zostać co do znaku identyczne.'
        + (kontrakt ? '\n\n' + kontrakt : ''))
      : ((wzor ? (wzor + '\n\n') : '') + text + '\n\nUstalenia z rozmowy:\n' + pjObetnijZnacznik(talk)
        + (kontrakt ? '\n\n' + kontrakt : ''));
    try {
      const bazaSpec = await pjKontekstNauki(text);
      if (bazaSpec) userB += '\n\n' + bazaSpec;
    } catch (e) { /* pack opcjonalny */ }
    if (/\[\[RYSUJ\]\]/i.test(talk)) {
      userB += '\n\nPO RYSUJ Z ROZMOWY: bryły i czesci[].bryly nie mogą być puste; jaskółczy ogon = kieszeń + luz 0,4.';
    }
    const body = {
      model: pjModelRoli(prev ? 'diff' : 'spec'),
      messages: [
        { role: 'system', content: pjSysSpec() },
        { role: 'user', content: userB }
      ],
      max_tokens: 32000,
      reasoning: { effort: prev ? 'high' : 'max' }
    };
    let spec;
    let shardBledy = [];
    // [[SZABLON:id(params)]] — generuj SPEC z szablonu bez wywołania LLM
    const szablonMatch = /\[\[SZABLON:(\w+)\(([^)]*)\)\]\]/i.exec(talk);
    if (szablonMatch && !prev) {
      const szId = szablonMatch[1];
      const szDef = SZABLONY.find(s => s.id === szId);
      if (szDef) {
        try {
          const args = szablonMatch[2].split(',').map(a => {
            const t = a.trim();
            if (/^\[/.test(t)) return JSON.parse(t);
            const n = Number(t);
            return isNaN(n) ? t : n;
          });
          const szabSpec = szDef.fn.apply(null, args);
          spec = {
            spec_version: '1.0',
            nazwa: szabSpec.nazwa,
            material: szabSpec.material || 'PETG',
            bryly: szabSpec.bryly,
            cechy: szabSpec.cechy || [],
            pytania: [],
            uwagi_do_druku: szabSpec.uwagi_do_druku || '',
            orientacja_druku: {
              obrot_xyz_deg: [0, 0, 0],
              sciana_na_plycie: 'spód',
              uzasadnienie: 'Szablon — druk pionowo lub płasko wg uwag.'
            },
            podpory: { wymagane: false, uzasadnienie: 'Szablon prosty — bez nawisów.', typ: 'brak' },
            brim: { wymagany: false, uzasadnienie: 'Szablon — stabilna podstawa.' }
          };
          chatLine('ai', '🔧 Użyto szablon: ' + szDef.nazwa + ' z parametrami (' + szablonMatch[2] + ')');
        } catch (e) {
          chatLine('ai', '⚠ Błąd szablonu ' + szId + ': ' + (e && e.message || e));
        }
      }
    }
    if (!spec && !prev && wykryjSharding(talk + '\n' + text)) {
      spec = await pjSpecSharded(talk, text, userB);
      shardBledy = spec._shardBledy || [];
      delete spec._shardBledy;
    } else {
      spec = parseSpec(await pjOdpowiedzSpec(body));
      spec = pjDomknijSpec(spec, talk, text);
    }
    try {
      if (pjUserMaMm(text) && !pjBriefZaCienki(text)
          && spec.pytania && spec.pytania.length
          && !(spec.bryly && spec.bryly.length) && pjSpecPusteBryly(spec)) {
        throw new Error(
          'Brief ma już mm — nie pytaj, wypełnij bryły. Przyjmij wtórne wymiary (ścianka 3 mm, szerokość 12 mm) w uwagi_do_druku. Pytanie: '
          + spec.pytania.join('; ')
        );
      }
      if (pjGotoweDoSpec(talk, text, prev)) pjOdrzucPustePoRysuj(spec, talk);
      pjWalidujSpecWejscie(spec);
      await zbuduj(spec, text.slice(0, 40), prev && prev, userB, {
        niepelnyShard: shardBledy.length > 0,
        shardBledy: shardBledy
      });
    } catch (first) {
      const msg1 = String((first && first.message) || first);
      if (/SHARD_FAIL/.test(msg1) || (!prev && wykryjSharding(talk + '\n' + text))) throw first;
      if (/SPEC_INCOMPLETE|SPEC_SCHEMA/.test(msg1)) {
        pjTele({ rola: 'spec', wynik: /SCHEMA/.test(msg1) ? 'schema-fail' : 'incomplete', schema: 'fail', retry: 1 });
      }
      const twardy = /SPEC_INCOMPLETE/.test(msg1)
        ? '\n\nWypełnij bryły z listy kształtów; jaskółczy ogon = kieszeń + luz 0,4; zakaz pustych brył.'
        : (/SPEC_SCHEMA/.test(msg1)
          ? '\n\nOddaj JSON wg schematu spec-v1 (wymagane pola, enum, bez pól spoza schematu).'
          : '');
      const popraw = Object.assign({}, body, {
        messages: [
          { role: 'system', content: pjSysSpec() },
          {
            role: 'user',
            content: userB
              + '\n\nPOPRZEDNI NIEPOPRAWNY SPEC:\n' + JSON.stringify(spec)
              + '\n\nBŁĄD WALIDATORA:\n' + msg1
              + twardy
              + '\n\nOddaj cały poprawiony SPEC. Napraw wyłącznie wskazany błąd; nie dodawaj nowych cech ani nie zmieniaj pozostałych ustaleń.'
          }
        ],
        reasoning: { effort: 'high' }
      });
      spec = pjDomknijSpec(parseSpec(await pjOdpowiedzSpec(popraw)), talk, text);
      if (pjGotoweDoSpec(talk, text, prev)) pjOdrzucPustePoRysuj(spec, talk);
      pjWalidujSpecWejscie(spec);
      await zbuduj(spec, text.slice(0, 40), prev && prev, userB);
    }
    pytanieRundy = 0;
  } catch (e) {
    setWarn({ wpisy: [{ poziom: 'blad', kod: 'MODEL', tekst: e.message }] });
    chatLine('ai', e.message);
  }
}

function offline() {
  const off = typeof navigator !== 'undefined' && navigator.onLine === false;
  const el = $('pjOffline');
  if (el) el.hidden = !off;
  const inp = $('pjIn'), btn = $('pjZrob');
  if (off) {
    if (inp) { inp.disabled = true; inp.placeholder = 'brak połączenia — możesz wkleić SPEC ręcznie'; }
    if (btn) btn.disabled = true;
  } else {
    if (inp) { inp.disabled = false; inp.placeholder = 'np. mydelniczka do wanny'; }
    if (btn) btn.disabled = false;
  }
}

function bind() {
  migrujMozgV16();
  pjPokazOstrzezenieFile();
  const talkSel = $('pjModelTalk');
  const specSel = $('pjModelSpec');
  const profilSel = $('pjProfil');
  if (talkSel) talkSel.addEventListener('change', onPjModelChange);
  if (specSel) specSel.addEventListener('change', onPjModelChange);
  if (profilSel) {
    profilSel.value = pjProfil();
    profilSel.addEventListener('change', function () {
      set('p2s.ai.profil', profilSel.value === 'eksperymentalny' ? 'eksperymentalny' : 'konserwatywny');
      syncPjModeleHint(orCatalog);
      pjPokazStamp();
    });
  }
  loadPjModele();
  pjPokazStamp();
  pjPobierzWersjaJson();
  const z = $('pjZrob'); if (z) z.addEventListener('click', zrob);
  const inp = $('pjIn');
  if (inp) inp.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zrob(); }
  });
  const fotoBtn = $('pjFoto');
  const fotoIn = $('pjFotoIn');
  if (fotoBtn && fotoIn) {
    fotoBtn.addEventListener('click', () => fotoIn.click());
    fotoIn.addEventListener('change', async () => {
      const f = fotoIn.files && fotoIn.files[0];
      if (f) await pjDolaczZdjecie(f);
      fotoIn.value = '';
    });
  }
  const thumbs = $('pjThumbs');
  if (thumbs) thumbs.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    pjPendingImgs.splice(+b.getAttribute('data-i'), 1);
    pjRysujMiniaturki();
    pjPokazHintWizji();
  });
  const prTo = $('pjPrzerobTo');
  if (prTo) prTo.addEventListener('click', pjPrzerobTo);
  const bs = $('pjBuildSpec');
  if (bs) bs.addEventListener('click', async () => {
    if (!(await bootEngine())) return;
    try {
      const prev = last && last.spec;
      await zbuduj(JSON.parse($('pjSpec').value), 'ręczny SPEC', prev);
    } catch (e) {
      setWarn({ wpisy: [{ poziom: 'blad', kod: 'SPEC', tekst: e.message }] });
    }
  });
  const dl = $('pjDl3mf');
  if (dl) dl.addEventListener('click', async () => {
    if (!last || !last.mesh) return;
    const eksper = last.eksperymentalny || werdyktEksperymentalny(last.spec);
    if (!last.werdykt.eksportOk && !eksper && !($('pjMimo') && $('pjMimo').checked)) return;
    if (!last.werdykt.eksportOk && !eksper) {
      const powod = window.prompt('Eksport mimo błędów bramki. Zapisz powód:');
      if (!powod) return;
      pushHist({ spec: last.spec, note: 'wiem, co robię: ' + powod, when: Date.now() });
    }
    const n = hist().length || 1;
    const lista = (last.czesci || []).filter(c => c && c.mesh);
    const buf = lista.length > 1
      ? await mesh3MFWiele(lista.map(c => ({
          nazwa: (c.spec && c.spec.nazwa) || last.spec.nazwa,
          mesh: c.mesh,
          bbox: c.mesh.bbox
        })), { nazwa: last.spec.nazwa, spec: last.spec })
      : await mesh3MF(last.mesh, { nazwa: last.spec.nazwa, spec: last.spec });
    const blob3 = new Blob([buf], { type: 'model/3mf' });
    const n3 = nazwa3mf(last.spec, n);
    if (window.P2S && typeof window.P2S.pobierzPlik === 'function') {
      await window.P2S.pobierzPlik(blob3, n3);
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob3);
      a.download = n3;
      a.click();
    }
    const t = tekstDeklaracji(last.spec, last.deklaracja, last.werdykt);
    const blobTxt = new Blob([t], { type: 'text/plain;charset=utf-8' });
    const nTxt = String(last.spec.nazwa || 'czesc') + '_v' + n + '_deklaracja.txt';
    if (window.P2S && typeof window.P2S.pobierzPlik === 'function') {
      await window.P2S.pobierzPlik(blobTxt, nTxt);
    } else {
      const b = document.createElement('a');
      b.href = URL.createObjectURL(blobTxt);
      b.download = nTxt;
      b.click();
    }
  });
  function toAnal() {
    if (!last || !last.mesh || typeof window.__p2sAnalLoadMesh !== 'function') {
      const pick = document.getElementById('aPick');
      const drop = document.getElementById('aDrop');
      const sz = document.getElementById('aSize');
      if (pick) pick.hidden = false;
      if (drop) drop.hidden = true;
      if (sz) sz.textContent = 'brak bryły w zakładce Projekt — najpierw Zrób';
      return false;
    }
    const lista = (last.czesci || []).filter(c => c && c.mesh);
    if (lista.length > 1 && typeof window.__p2sAnalLoadMeshes === 'function') {
      window.__p2sAnalLoadMeshes(lista.map(c => {
        const vf = meshToVF(c.mesh);
        return { name: (c.spec && c.spec.nazwa) || last.spec.nazwa, V: vf.V, F: vf.F };
      }), last.spec.nazwa || 'projekt');
    } else {
      const vf = meshToVF(last.mesh);
      window.__p2sAnalLoadMesh(last.spec.nazwa || 'projekt', vf.V, vf.F);
    }
    const tab = document.querySelector('#tabs .tab[data-v="tools"]');
    if (tab) tab.click();
    const t = document.getElementById('tAnal');
    if (t) t.scrollIntoView();
    return true;
  }
  const an = $('pjAnal');
  if (an) an.addEventListener('click', toAnal);
  window.__p2sProjektToAnal = toAnal;
  const mimo = $('pjMimo');
  if (mimo) mimo.addEventListener('change', () => syncExport(last && last.werdykt));
  const histSel = $('pjHist');
  if (histSel) histSel.addEventListener('change', async () => {
    const a = hist(); const i = +histSel.value;
    if (!a[i] || !a[i].spec) return;
    if (!(await bootEngine())) return;
    await zbuduj(a[i].spec, 'powrót v' + (i + 1));
  });
  const py = $('pjPytanieOk');
  if (py) py.addEventListener('click', async () => {
    const ans = ($('pjPytanieIn').value || '').trim();
    if (!ans) return;
    pytanieRundy += 1;
    $('pjIn').value = ans;
    if (pytanieRundy >= 2) chatLine('ai', 'Przyjmuję wartości domyślne po dwóch rundach pytań.');
    zrob();
  });
  const wmin = $('pjWmin');
  if (wmin) wmin.addEventListener('change', async () => {
    if (!last || !last.spec) return;
    last = buildAndGate(last.spec, { wmin: wmin.checked ? 0.42 : 0.8 });
    lastIdx = Math.min(lastIdx, (last.czesci && last.czesci.length ? last.czesci.length : 1) - 1);
    rysujAktualna();
    fillCzesciSwitch();
    setWarn(last.werdykt);
    syncExport(last.werdykt);
    pokazCheckliste(last.spec, last.werdykt);
  });
  const wizCb = $('pjWizjaProjekt');
  if (wizCb) {
    let off = false;
    try { off = localStorage.getItem('p2s.wizjaProjekt') === '0'; } catch (e0) {}
    wizCb.checked = !off;
    if (window.P2S && typeof window.P2S.ustawWizjeProjekt === 'function') {
      window.P2S.ustawWizjeProjekt(!off);
    }
    wizCb.addEventListener('change', () => {
      if (window.P2S && typeof window.P2S.ustawWizjeProjekt === 'function') {
        window.P2S.ustawWizjeProjekt(!!wizCb.checked);
      }
    });
  }
  function otworzRzut(klucz) {
    if (!last) return;
    const r = (last.czesci && last.czesci[lastIdx]) || last;
    if (!r || !r.mesh) return;
    let dlg = $('pjRzutDlg');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'pjRzutDlg';
      dlg.innerHTML = '<canvas id="pjRzutDuzy" width="720" height="520" aria-label="powiększony rzut"></canvas>'
        + '<p id="pjRzutPrzebieg" class="tnote"></p>'
        + '<button type="button" class="btn" id="pjRzutZamknij">Zamknij</button>';
      document.body.appendChild(dlg);
      $('pjRzutZamknij').addEventListener('click', () => dlg.close());
    }
    const c = $('pjRzutDuzy');
    const ctx = c.getContext('2d');
    rysuj(ctx, rzutuj(r.mesh, WIDOKI[klucz], c.width, c.height));
    const bb = r.mesh.bbox;
    const przeb = $('pjRzutPrzebieg');
    if (przeb) {
      przeb.textContent = WIDOKI[klucz].etykieta + ' · ' + etykietaGabarytu(klucz, bb)
        + ' · przebieg ' + bb.x.toFixed(1) + '×' + bb.y.toFixed(1) + '×' + bb.z.toFixed(1) + ' mm';
    }
    if (dlg.showModal) dlg.showModal();
    else dlg.setAttribute('open', '');
  }
  ['pjIzo', 'pjPrzod', 'pjBok', 'pjGora'].forEach((id, i) => {
    const c = $(id);
    if (c) c.addEventListener('click', () => otworzRzut(['izo', 'przod', 'bok', 'gora'][i]));
  });
  const sw = $('pjCzesciSwitch');
  if (sw) sw.addEventListener('click', e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    lastIdx = +b.getAttribute('data-i') || 0;
    rysujAktualna();
    fillCzesciSwitch();
  });
  window.addEventListener('online', offline);
  window.addEventListener('offline', offline);
  offline();
  fillHist();
}

const tabs = document.getElementById('tabs');
if (tabs) tabs.addEventListener('click', e => {
  const b = e.target.closest('.tab');
  if (b && b.dataset.v === 'projekt') bootEngine();
});
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
else bind();

window.__p2sProjektFromBrief = function (text) {
  const t = document.querySelector('#tabs .tab[data-v="projekt"]');
  if (t) t.click();
  const inp = $('pjIn');
  if (inp) inp.value = text;
};

window.__p2sProjektFromWzor = function (text) {
  const t = document.querySelector('#tabs .tab[data-v="projekt"]');
  if (t) t.click();
  window.__p2sWzorTekst = text;
  chatLine('ai', 'Dostałem wymiary z analizatora jako inspirację mechanizmu — nie jako wymiary Twojej części.');
  const inp = $('pjIn');
  if (inp && !inp.value) inp.placeholder = 'np. zrób podobny mechanizm, ale na moją lufę 25 mm';
};

if (typeof window !== 'undefined') {
  window.P2S = window.P2S || {};
  window.P2S.szukajSieci = szukajSieci;
  window.P2S.wyciagnijSzukaj = wyciagnijSzukaj;
  window.P2S.hostDozwolony = hostDozwolony;
  window.P2S.tekstWynikowSzukania = tekstWynikowSzukania;
  window.P2S.szukajNauki = szukajNauki;
  window.P2S.tekstKontekstuNauki = tekstKontekstuNauki;
  window.P2S.ladujPackNauki = ladujPackNauki;
  window.P2S.pjKontekstNauki = pjKontekstNauki;
  window.P2S.SZABLONY = SZABLONY;
  window.P2S.dopasujSzablony = dopasujSzablony;
  window.P2S.pjZapiszNitke = pjZapiszNitke;
  window.P2S.pjPrzerobTo = pjPrzerobTo;
  window.P2S.pjOpisZdjeciaFlash = pjOpisZdjeciaFlash;
  window.P2S.parseScalePercent = parseScalePercent;
  window.P2S.scaleLiveMesh = scaleLiveMesh;
  window.P2S.scaleSpecNumeric = scaleSpecNumeric;
  window.P2S.ocenBrimPoSkali = ocenBrimPoSkali;
  window.P2S.wczytajNitke = wczytajNitke;
  window.P2S.HINT_BEZ_WIZJI = HINT_BEZ_WIZJI;
  window.P2S.TINY_PNG_DATA_URL = TINY_PNG_DATA_URL;
  window.P2S.modelCzytaObraz = modelCzytaObraz;
  window.P2S.bledySpecSchema = bledySpecSchema;
  window.P2S.walidujSpecAlboRzuc = walidujSpecAlboRzuc;
  window.P2S.orHttpRetryowalny = orHttpRetryowalny;
  window.P2S.orKomunikatBusy = orKomunikatBusy;
  window.P2S.werdyktEksperymentalny = werdyktEksperymentalny;
  window.P2S.pjProfil = pjProfil;
  window.P2S.PJ_TIMEOUT_TALK_MS = PJ_TIMEOUT_TALK_MS;
  window.P2S.PJ_TIMEOUT_SPEC_MS = PJ_TIMEOUT_SPEC_MS;
}

if (typeof window.__p2sProjektGotowy === 'function') window.__p2sProjektGotowy();
