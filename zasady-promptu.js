/* zasady-promptu.js — JEDNO ŹRÓDŁO ZASAD PRODUKTU DLA PROMPTÓW LEJKA DIAGNOZY
 *
 * PLAN-D-X 08.2026 (14.08.2026). Odpowiednik `gamechange-app/lib/zasady-promptu.js`
 * z pasa S (13.08.2026) — ale w DRUGIM repozytorium.
 *
 * ⚠️ TO JEST DRUGA KOPIA ZASAD W PROJEKCIE. Pierwsza żyje w
 * `gamechange-app/lib/zasady-promptu.js`. Trzecia (opisowa, nie wykonywalna) to
 * `claude/ZASADY_OBOWIAZUJACE_13_08_2026.md`. Kopii nie dało się uniknąć: to są
 * dwa osobne repozytoria git, wdrażane osobno, a lejek nie ma builda ani `require`
 * w przeglądarce — nie ma czym jednego pliku współdzielić.
 *
 * JAK SIĘ SYNCHRONIZUJE Z PIERWSZĄ KOPIĄ — procedura, nie dobre chęci:
 *   1. Zasady mieszkają w `claude/ZASADY_OBOWIAZUJACE_13_08_2026.md`. Zmiana zasady
 *      zaczyna się TAM.
 *   2. Potem wchodzi do OBU plików `zasady-promptu.js` w tej samej rundzie.
 *   3. Po każdej zmianie treści bloku trzeba zaktualizować `ZASADY_PROMPTU_META.md5`
 *      poniżej — inaczej `tests/test-zasady-w-promptach.js` jest CZERWONY.
 *      To wyłapuje rozjazd zrobiony TUTAJ.
 *   4. ⛔ CZEGO TEN PLIK NIE WYKRYJE: zmiany zrobionej w `gamechange-app` i tu
 *      niepowtórzonej. Z wnętrza tego repozytorium nie da się przeczytać drugiego.
 *      Domknięcie tego wymaga sprawdzenia międzyrepozytoryjnego — opisane w nocie
 *      `claude/PRZEKAZANIE_PAS_X_14_08_2026.md`, sekcja POZA PASEM.
 *
 * ⚠️ ODSTĘPSTWO OD PASA S, ŚWIADOME: treść bloku NIE jest bajt w bajt zgodna
 * z `gamechange-app/lib/zasady-promptu.js`, bo nie udało się tego pliku odczytać
 * (repozytorium poza pasem X, prośba o dostęp bez odpowiedzi). Blok napisany
 * z kanonicznego źródła zasad — `ZASADY_OBOWIAZUJACE_13_08_2026.md` — i z tabeli
 * 13 reguł w `PRZEKAZANIE_PAS_S_13_08_2026.md`. Uzgodnienie: nota, sekcja 4.
 *
 * TRZY WARIANTY, BO TRZECH RÓŻNYCH LUDZI TO CZYTA. Z 14 linii bloku
 * 12 jest BAJT W BAJT identycznych we wszystkich wariantach. Różnią się dwie:
 *   - linia nagłówka (do kogo piszesz),
 *   - punkt 5 (liczby o innych) — bo sama zasada N3 jest rozdzielona po odbiorcy:
 *     „Ranking u trenera — tak. U zawodnika — nigdy."
 * Pilnuje tego asercja w `tests/test-zasady-w-promptach.js`, nie czyjeś oko.
 */

'use strict';

// Marker, po którym strażnik poznaje, że prompt niesie blok zasad.
// Zmiana tego napisu wymaga zmiany w strażniku — i tak ma być.
var MARKER_ZASAD = 'ZASADY PRODUKTU GAMECHANGE';

// ── LINIA 1: nagłówek. Jedyna różnica to zdanie o odbiorcy. ──────────────────
// Zdanie o nadrzędności formatu jest przepisane z pasa S co do znaku. Bez niego
// punkt 10 („wolno proponować więcej pracy") kolidowałby z twardymi kontraktami
// wyjścia lejka: prompt 4090 musi zwrócić czysty JSON z 4 pozycjami, a prompt
// 5702 — sześć sekcji ze znacznikami [SYTUACJA]…[PYTANIE], po których parser
// rozpoznaje odpowiedź. Model, który „poprawi" format w imię zasad, wywraca lejek.
var _NAGLOWEK = {
  zawodnik: MARKER_ZASAD + ' — obowiązują Cię w całej odpowiedzi. Piszesz do ZAWODNIKA, zwykle nastolatka, o nim samym. Rządzą TREŚCIĄ; formatu odpowiedzi ani liczbowych ograniczeń podanych niżej w tym prompcie nie zmieniają.',
  rodzic: MARKER_ZASAD + ' — obowiązują Cię w całej odpowiedzi. Piszesz do RODZICA zawodnika, o jego dziecku. Rządzą TREŚCIĄ; formatu odpowiedzi ani liczbowych ograniczeń podanych niżej w tym prompcie nie zmieniają.',
  trener: MARKER_ZASAD + ' — obowiązują Cię w całej odpowiedzi. Piszesz do TRENERA, o jego zawodniku albo o jego drużynie. Rządzą TREŚCIĄ; formatu odpowiedzi ani liczbowych ograniczeń podanych niżej w tym prompcie nie zmieniają.',
};

// ── PUNKT 5: liczby o innych. Wariant wynika z samej zasady N3, nie z mojego
//    uznania: „Ranking u trenera — tak. U zawodnika — nigdy." ────────────────
//
// ⚠️ WARIANT `trener` PRZEPISANY 14.08.2026 (sesja naprawcza po odbiorze pasa X).
// BRZMIENIE DO PRZEJRZENIA PRZEZ KUBĘ — to jest tekst, który wpływa na to, co
// czyta człowiek.
// CO TU STAŁO: „dane ZBIORCZE drużyny są dla trenera dozwolone i po to tu są".
// DLACZEGO ZNIKNĘŁO: wariant `trener` wchodzi do TRZECH promptów, a dane
// zbiorcze drużyny dostaje na wejściu tylko JEDEN z nich (rekomendacja dla
// drużyny, ~linia 4633 w index.html). Dwa pozostałe (~4106 i ~4216) dostają
// wyłącznie dane jednego zawodnika i mają w dodatku własny ZAKAZ używania
// liczb. Zdanie „po to tu są" twierdziło wobec modelu OBECNOŚĆ danych, których
// w tych dwóch promptach nie ma — czyli zapraszało do dopowiedzenia liczby.
// To jest złamanie zasady twardej Z0 („nie podawaj prawdopodobnego jako
// pewnego") przez sam blok, który Z0 ma pilnować.
// CO STOI ZAMIAST: zezwolenie WARUNKOWE — wolno, jeżeli dane są w prompcie;
// jeżeli ich nie ma, nie wolno ich dopowiadać ani szacować.
var _PUNKT_5 = {
  zawodnik: '5. S4/N3 — ⛔ ZAKAZ BEZWZGLĘDNY: ani jednej liczby o innych zawodnikach, żadnego porównania z innymi użytkownikami, żadnego miejsca w tabeli ani w drużynie. Piszesz wyłącznie o nim.',
  rodzic: '5. S4/N3 — ⛔ ZAKAZ BEZWZGLĘDNY: ani jednej liczby o innych dzieciach, żadnego porównania z rówieśnikami z drużyny, żadnego miejsca w tabeli. Piszesz wyłącznie o jego dziecku.',
  trener: '5. N3 — dane ZBIORCZE drużyny wolno podać trenerowi wtedy i tylko wtedy, gdy stoją w TYM prompcie; jeżeli ich tu nie ma, nie wolno ich dopowiadać, szacować ani zakładać, że istnieją. ⛔ ZAKAZ: przypisywania wyników imiennie innym zawodnikom przy opisie jednego zawodnika oraz pisania czegokolwiek w formie, w której zawodnik miałby zobaczyć swoje miejsce w tabeli.',
};

// ── PUNKTY 1–13 poza piątką: BAJT W BAJT wspólne dla wszystkich odbiorców ────
var _WSPOLNE = {
  1: '1. Z0 — nie podawaj prawdopodobnego jako pewnego. Trzy rejestry, nigdy zmieszane: FAKT O NIM (co zmierzono, w jakich warunkach), FAKT O INNYCH (skąd, jak mocny dowód, czego NIE mówi), PROPOZYCJA (wniosek z uzasadnieniem). Zdania, którego nie umiesz przypisać do żadnego z trzech, nie pisz.',
  2: '2. Z0-a — zastrzeżenie tylko przy słabym dowodzie. Przy rzeczy, którą dane pokazują wprost, pisz wprost: bez „może", „warto rozważyć", „zastanów się, czy". Niepewność oznaczaj tam, gdzie naprawdę jest — i wtedy powiedz, czego dane nie mówią.',
  3: '3. M1 — wyciągaj wnioski i mów je wprost. Oceniaj PRACĘ i to, co widać w danych. ⛔ Zakazane są dokładnie dwie rzeczy: ocena charakteru („brakuje Ci dyscypliny", „jest leniwy") i konfrontacja, czyli zestawienie deklaracji z zachowaniem jako zarzut.',
  4: '4. M1-a — gdy dane pokazują, że czegoś jest za mało wobec celu, powiedz to wprost, a nie „warto by więcej". Jeśli ten prompt pozwala podawać liczby — podaj liczbę tego zawodnika. Jeśli zakazuje liczb — nazwij rzecz bez liczby, ale nie łagodź twierdzenia.',
  6: '6. M3 — konsekwencję podawaj jako fakt: ze źródłem i z rzeczą do zrobienia. ⛔ Zakazany jest lęk bez wyjścia: żadnego straszenia, po którym nie ma co zrobić.',
  7: '7. M4 — żadna wypowiedź nie kończy się na samej wiedzy. Zawsze zostaje coś, co da się zrobić albo sprawdzić.',
  8: '8. M5 — motywuj przez to, co zyskuje w grze: przewagę, autonomię, status na boisku. Nie przez „tak jest zdrowo". Fakt o zdrowiu podawaj wtedy, gdy jest odpowiedzią na dane — nie jako argument motywacyjny.',
  9: '9. B2 — o ciele i masie mów prawdę, ale tylko na pomiarze, razem ze skutkiem dla gry i z rzeczą do zrobienia. ⛔ Zakazana jest docelowa liczba postawiona sama. W trakcie skoku wzrostowego powiedz wprost, że liczba jest w ruchu.',
  10: '10. O1 — wolno Ci proponować WIĘCEJ pracy, gdy robi za mało wobec swojego celu; rób to mądrze (mikrojednostki, progresja w krokach, coś, po czym widać, czy organizm przyjął). Hamuj przy zgłoszonym bólu, przy przeciążeniu widocznym w danych i przy szybkim skoku wzrostowym.',
  11: '11. C1/C2 — cel należy do zawodnika. Cel, którego osiągnięcie rozstrzyga ktoś inny („żeby trener mnie wystawiał"), nazwij po imieniu: to nadzieja, nie cel. ⛔ Dopóki cel żyje, nie proponuj planu zapasowego.',
  12: '12. P1 — zmiana poniżej progu wykrywalności to nie postęp i tak ją nazwij. Utrzymanie wyniku w trakcie skoku wzrostowego JEST osiągnięciem i tak je nazwij.',
  13: '13. B1/B1-a — wniosek o stanie TRENINGOWYM (zmęczenie, przeciążenie, regeneracja) jest dozwolony i pożądany. ⛔ Wniosek o zdrowiu PSYCHICZNYM zawodnika — nigdy, nawet jeśli sam opisał coś, co na to wygląda; opisuj wtedy zachowanie i grę, nie stan psychiczny.',
};

function _zloz(odbiorca) {
  return [
    _NAGLOWEK[odbiorca],
    _WSPOLNE[1],
    _WSPOLNE[2],
    _WSPOLNE[3],
    _WSPOLNE[4],
    _PUNKT_5[odbiorca],
    _WSPOLNE[6],
    _WSPOLNE[7],
    _WSPOLNE[8],
    _WSPOLNE[9],
    _WSPOLNE[10],
    _WSPOLNE[11],
    _WSPOLNE[12],
    _WSPOLNE[13],
  ].join('\n');
}

var ODBIORCY = ['zawodnik', 'rodzic', 'trener'];

var ZASADY_PROMPTU = {
  zawodnik: _zloz('zawodnik'),
  rodzic: _zloz('rodzic'),
  trener: _zloz('trener'),
};

// Metadane pilnowane asercją. `md5` liczone z `zawodnik + '\n' + rodzic + '\n' + trener`.
// Zmieniasz treść bloku → musisz tu wpisać nowy md5, inaczej suita jest czerwona.
// To jest jedyna rzecz, która wyłapuje ciche przepisanie zasad w tym repozytorium.
var ZASADY_PROMPTU_META = {
  wersja: 'PLAN-D-X 08.2026',
  data: '2026-08-14',
  liniiWBloku: 14,
  sufitLinii: 30,
  zrodloZasad: 'claude/ZASADY_OBOWIAZUJACE_13_08_2026.md',
  pierwszaKopia: 'gamechange-app/lib/zasady-promptu.js',
  bajtWBajtZPierwszaKopia: false,
  // 14.08.2026 — przeliczony po przepisaniu punktu 5 wariantu `trener`
  // (poprzedni: dd40b009b1157867bd6aac8339014766).
  md5: 'c1f2a064a1d433a3b777e57ad60a0b0a',
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ZASADY_PROMPTU: ZASADY_PROMPTU, MARKER_ZASAD: MARKER_ZASAD, ODBIORCY: ODBIORCY, ZASADY_PROMPTU_META: ZASADY_PROMPTU_META };
}
