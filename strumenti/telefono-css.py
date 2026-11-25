"""Genera in fondo ad app.css il blocco per il telefono che ingrandisce le scritte piccole.
Si può rilanciare: il blocco fra i due segni viene sostituito."""
import re, sys
P = sys.argv[1]
INIZIO = '/* ---------- telefono: scritte piccole più grandi (generato) ---------- */'
FINE = '/* ---------- fine telefono ---------- */'
MAPPA = {9.5: 11.5, 10: 12, 10.5: 12, 11: 12.5, 11.5: 13, 12: 13, 12.5: 13}
# righe strette dove 1px in più manda a capo il titolo a fianco (collaudo del 25/11/2026)
ESCLUSI = {'.chip', '.ar-bf .chip', '.fc-txt small', '.sc-kpi', '.au-r .r-main small'}
css = open(P, encoding='utf-8').read()
if INIZIO in css:
    css = css[:css.index(INIZIO)].rstrip() + '\n'

def regole(testo):
    """Restituisce (contesto @media, selettore, corpo) per ogni regola, anche dentro @media."""
    out, i, pila, sel_inizio = [], 0, [], 0
    testo = re.sub(r'/\*.*?\*/', lambda m: ' ' * len(m.group()), testo, flags=re.S)
    while i < len(testo):
        c = testo[i]
        if c == '{':
            sel = testo[sel_inizio:i].strip()
            if sel.startswith('@'):
                pila.append(sel); sel_inizio = i + 1
            else:
                j = testo.index('}', i)
                out.append((' '.join(pila), sel, testo[i + 1:j]))
                i = j; sel_inizio = j + 1
        elif c == '}':
            if pila: pila.pop()
            sel_inizio = i + 1
        elif c == ';' and not pila:
            sel_inizio = i + 1
        i += 1
    return out

righe = []
for ctx, sel, corpo in regole(css):
    if 'print' in ctx or 'min-width' in ctx or '@keyframes' in ctx or '@font-face' in ctx:
        continue
    if sel in ESCLUSI:
        continue
    m = re.search(r'(?<![-\w])font-size:\s*(\d+(?:\.\d+)?)px\s*(!important)?', corpo)
    if not m:
        m2 = re.search(r'(?<![-\w])font:\s*([^;]*?)\b(\d+(?:\.\d+)?)px(/[\d.]+(?:px)?)?\s+([^;]+)', corpo)
        if not m2 or float(m2.group(2)) not in MAPPA:
            continue
        v = MAPPA[float(m2.group(2))]
        righe.append(f'  {sel} {{ font-size: {v:g}px; }}')
        continue
    v = float(m.group(1))
    if v in MAPPA:
        imp = ' !important' if m.group(2) else ''
        if 'uppercase' in corpo:  # etichette maiuscole e spaziate: già larghe, crescono poco e si stringe la spaziatura
            righe.append(f'  {sel} {{ font-size: {min(MAPPA[v], v + 1):g}px{imp}; letter-spacing: .04em; }}')
        else:
            righe.append(f'  {sel} {{ font-size: {MAPPA[v]:g}px{imp}; }}')

blocco = [INIZIO, '@media (max-width: 640px) {'] + righe + ['}', FINE]
open(P, 'w', encoding='utf-8', newline='\n').write(css + '\n'.join(blocco) + '\n')
print(len(righe), 'regole')
