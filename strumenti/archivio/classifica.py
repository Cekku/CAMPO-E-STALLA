"""Classificazione dei documenti dell'archivio: area, sottoarea, tipo, data, controparte, persona, nome proposto.

Tre fonti, in ordine di fiducia:
  1. la cartella in cui il file sta già (mappa locale %USERPROFILE%\\ArchivioAzienda\\mappa-cartelle.json);
  2. regole sul testo e sul nome del file (qui sotto: solo regole generiche, senza nomi veri);
  3. quello che resta lo classificano Claude (lavoro iniziale) o il modello sul PC (file nuovi).

Le regole con nomi veri (fornitori, dipendenti) non stanno qui: i dipendenti si ricavano dalle cartelle,
i nomi dell'azienda dalle impostazioni locali ("nomi_azienda" in config.json).
"""
import datetime as dt
import os
import re

OGGI = dt.date.today()

# (tipo, area, sottoarea, regex sul testo, regex sul nome del file). L'ordine conta: prima le più specifiche.
R = lambda s: re.compile(s, re.I)

# Nomi di file che dicono già tutto (esportazioni della banca, ricevute): valgono prima del testo.
NOMI_DECISIVI = [
    (R(r'^dettaglimovimento|^gestionaledistinte|^bonificosct|^contabile'), 'Bonifico', '04 Banche e finanziamenti', 'Bonifici e contabili'),
    (R(r'^bollettacbill|^cbill'), 'Pagamento-CBILL', '04 Banche e finanziamenti', 'Bonifici e contabili'),
    (R(r'^listamovimenti|^estrattoconto|^estratto.?conto'), 'Estratto-conto', '04 Banche e finanziamenti', 'Estratti conto'),
    (R(r'^notificapec|^daticert|^postacert'), 'Ricevuta-PEC', '01 Società e soci', 'Camera di commercio e PEC'),
    (R(r'^delegaf24|^f24[ _-]'), 'F24', '02 Fisco e contabilità', 'F24 e F23'),
    (R(r'^unilav'), 'UNILAV', '05 Personale', 'Ispettorato, LUL e comunicazioni'),
]

REGOLE = [
    ('Fattura-elettronica', '03 Fatture', None, R(r'FatturaElettronica|Versione tracciato fattura|FATTURA ELETTRONICA'), None),
    ('Nota-di-credito', '03 Fatture', None, R(r'NOTA DI CREDITO'), R(r'nota.?di.?credito')),
    ('Proforma', '03 Fatture', 'DDT e proforma', R(r'PRO-?\s?FORMA'), R(r'pro.?forma')),
    ('Bonifico', '04 Banche e finanziamenti', 'Bonifici e contabili', R(r'^[\s\S]{0,400}?(DISPOSIZIONE DI BONIFICO|BONIFICO (SEPA|ISTANTANEO|ORDINARIO)|ESITO (DELLA )?DISPOSIZIONE|DETTAGLI MOVIMENTO|PAGAMENTO EFFETTI)'), R(r'bonific')),
    ('Fattura', '03 Fatture', None, R(r'\bFATTURA\b[\s\S]{0,2500}?(P\.?\s?IVA|PARTITA IVA|IMPONIBILE)'), R(r'fattur|^FT_|^FPR|^IT\d{11}_')),
    ('DDT', '03 Fatture', 'DDT e proforma', R(r'DOCUMENTO DI TRASPORTO|\bD\.?D\.?T\.? ?N'), R(r'\bddt\b')),
    ('Antimafia', '01 Società e soci', 'DURC, antimafia e dichiarazioni', R(r'ANTIMAFIA'), R(r'antimafia')),
    ('DURC', '01 Società e soci', 'DURC, antimafia e dichiarazioni', R(r'\bDURC\b|DOCUMENTO UNICO DI REGOLARIT'), R(r'durc')),
    ('Dichiarazione-sostitutiva', '01 Società e soci', 'DURC, antimafia e dichiarazioni', R(r'DICHIARAZIONE SOSTITUTIVA'), None),
    ('Visura-camerale', '01 Società e soci', 'Visura e atti societari', R(r'VISURA (ORDINARIA|CAMERALE|STORICA)|CERTIFICATO DI ISCRIZIONE'), R(r'visura.?(camerale|societaria)')),
    ('Visura-catastale', '09 Terreni e fabbricati', 'Visure e catasto', R(r'VISURA (PER SOGGETTO|PER IMMOBILE|CATASTALE)|CATASTO (TERRENI|FABBRICATI)|ESTRATTO DI MAPPA'), R(r'visur|catast|mappa')),
    ('F24', '02 Fisco e contabilità', 'F24 e F23', R(r'MODELLO F24|DELEGA IRREVOCABILE|F24 SEMPLIFICATO|DELEGA UNIFICATA F24|\bF24\b.{0,40}QUIETANZA'), R(r'\bf24|delegaf2')),
    ('F23', '02 Fisco e contabilità', 'F24 e F23', R(r'MODELLO F23'), R(r'\bf23')),
    ('CU', '02 Fisco e contabilità', 'CU', R(r'CERTIFICAZIONE UNICA|CERTIFICAZIONE DI CUI ALL.ART\.? ?4'), R(r'^cu[ _-]|\bcu \d{4}')),
    ('Contributi-colf', '16 Privato soci', None, R(r'LAVORATORI DOMESTICI'), None),
    ('Busta-paga', '05 Personale', 'Buste paga e bilancini paghe', R(r'CEDOLINO|BUSTA PAGA|PROSPETTO PAGA|NETTO (IN BUSTA|DEL MESE)'), R(r'busta|cedolin')),
    ('LUL', '05 Personale', 'Ispettorato, LUL e comunicazioni', R(r'LIBRO UNICO DEL LAVORO'), R(r'\blul\b')),
    ('UNILAV', '05 Personale', 'Ispettorato, LUL e comunicazioni', R(r'UNILAV|MODELLO UNIFICATO.{0,20}LAV|COMUNICAZIONE OBBLIGATORIA'), R(r'unilav')),
    ('Contratto-di-lavoro', '05 Personale', 'Dipendenti', R(r'CONTRATTO (INDIVIDUALE )?DI LAVORO|LETTERA DI ASSUNZIONE'), R(r'assunzion')),
    ('Permesso-di-soggiorno', '05 Personale', 'Dipendenti', R(r'PERMESSO DI SOGGIORNO'), R(r'permesso.?di.?sogg')),
    ('Idoneita', '05 Personale', 'Sicurezza e visite mediche', R(r'GIUDIZIO DI IDONEIT|IDONEIT. ALLA MANSIONE|SORVEGLIANZA SANITARIA'), R(r'idoneit')),
    ('Ispettorato', '05 Personale', 'Ispettorato, LUL e comunicazioni', R(r'ISPETTORATO (TERRITORIALE |NAZIONALE )?DEL LAVORO'), None),
    ('Cartella-esattoriale', '02 Fisco e contabilità', 'Cassetto fiscale e avvisi', R(r'ENTRATE.{0,3}RISCOSSIONE|CARTELLA DI PAGAMENTO|AVVISO BONARIO|COMUNICAZIONE DI IRREGOLARIT'), R(r'avvisatura|cartella')),
    ('Avviso-di-pagamento', '02 Fisco e contabilità', 'Tributi e imposte locali', R(r'AVVISO DI PAGAMENTO|pagoPA'), R(r'avviso')),
    ('Dichiarazione-redditi', '02 Fisco e contabilità', 'Dichiarazioni dei redditi', R(r'MODELLO REDDITI|REDDITI (PF|SP|SC) 20\d\d|MOD\.? ?730|\bUNICO 20\d\d'), R(r'\b730\b|unico|redditi')),
    ('Dichiarazione-IVA', '02 Fisco e contabilità', 'IVA', R(r'DICHIARAZIONE IVA|QUADRO VE\b|LIQUIDAZIONI? PERIODICH'), R(r'\biva\b|lipe')),
    ('Bilancio', '02 Fisco e contabilità', 'Bilanci e bilancini', R(r'BILANCIO DI VERIFICA|SITUAZIONE (CONTABILE|PATRIMONIALE)|STATO PATRIMONIALE|CONTO ECONOMICO'), R(r'bilanc')),
    ('Estratto-conto', '04 Banche e finanziamenti', 'Estratti conto', R(r'ESTRATTO (DI )?CONTO CORRENTE|ESTRATTO CONTO N|LISTA MOVIMENTI|SALDO (CONTABILE|INIZIALE)'), R(r'estratt')),
    ('Finanziamento', '04 Banche e finanziamenti', 'Finanziamenti e mutui', R(r'\bMUTUO\b|CREDITO AGRARIO|PIANO DI AMMORTAMENTO|CONTRATTO DI FINANZIAMENTO|\bFIDO\b|AFFIDAMENTO BANCARIO'), R(r'mutuo|finanziam|credito.?agrario')),
    ('Sinistro', '07 Assicurazioni e sinistri', 'Sinistri e danni', R(r'DENUNCIA DI SINISTRO|\bSINISTRO\b|PERIZIA DANNI|AVVERSIT. ATMOSFERIC'), R(r'sinistr|danni|grandin')),
    ('Polizza', '07 Assicurazioni e sinistri', 'Polizze', R(r'\bPOLIZZA\b|CERTIFICATO DI ASSICURAZIONE|PREMIO (ANNUO|LORDO)|COMPAGNIA DI ASSICURAZION'), R(r'polizz|assicura')),
    ('Contratto-di-affitto', '09 Terreni e fabbricati', 'Contratti di affitto', R(r'CONTRATTO DI AFFITTO|AFFITTO (DI FONDO|AGRARIO|DI AZIENDA)|PATTI IN DEROGA|COMODATO'), R(r'affitt|comodat')),
    ('Atto-di-compravendita', '09 Terreni e fabbricati', 'Compravendite', R(r'COMPRAVENDITA|ATTO DI VENDITA|\bROGITO\b|REPERTORIO N'), R(r'compraven|rogito|\batto\b')),
    ('Demanio', '09 Terreni e fabbricati', 'Demanio e concessioni', R(r'DEMANIO|DEMANIALE|CANONE GOLENALE'), R(r'demani|golenal|molo')),
    ('Pratica-edilizia', '09 Terreni e fabbricati', 'Progetti, permessi e lavori', R(r'PERMESSO DI COSTRUIRE|\bSCIA\b|\bCILA\b|DIREZIONE LAVORI|COMPUTO METRICO|STATO AVANZAMENTO LAVORI|AGIBILIT'), R(r'progett|tavola|esploso|\bsal\b|computo')),
    ('Agrivoltaico', '10 Energia', 'Agrivoltaico', R(r'AGRIVOLTAIC|AGRI-VOLTAIC'), R(r'agrivolt')),
    ('Biometano', '10 Energia', 'Biometano', R(r'BIOMETANO|BIOGAS'), R(r'biometan|biogas')),
    ('Allacciamento', '10 Energia', 'Allacciamenti Enel', R(r'E-DISTRIBUZIONE|E DISTRIBUZIONE|ENEL DISTRIBUZIONE|PREVENTIVO DI CONNESSIONE|CODICE DI RINTRACCIABILIT'), R(r'allacci|enel|cabina')),
    ('Fotovoltaico', '10 Energia', 'Fotovoltaico', R(r'FOTOVOLTAIC|INVERTER|SCAMBIO SUL POSTO|\bkWp\b|GESTORE DEI SERVIZI ENERGETICI'), R(r'fotovolt|\bfv\b|_fv|inverter')),
    ('Domanda-PSR', '08 Contributi e bandi', 'PSR', R(r'\bPSR\b|SVILUPPO RURALE|\bSRD\s?\d|COMPLEMENTO DI SVILUPPO'), R(r'\bpsr\b')),
    ('ISI-INAIL', '08 Contributi e bandi', 'ISI INAIL', R(r'\bISI\b.{0,30}INAIL|BANDO ISI'), R(r'\bisi\b')),
    ('ISMEA', '08 Contributi e bandi', 'ISMEA', R(r'\bISMEA\b'), R(r'ismea')),
    ('Transizione-4.0', '08 Contributi e bandi', 'Transizione 4.0', R(r'(TRANSIZIONE|INDUSTRIA) 4\.0|INTERCONNESSION|PERIZIA TECNICA ASSEVERATA|CREDITO D.IMPOSTA'), R(r'4\.0|interconn|perizia')),
    ('Domanda-contributo', '08 Contributi e bandi', 'Altri contributi e statistiche', R(r'DOMANDA DI (CONTRIBUTO|SOSTEGNO|PAGAMENTO|AIUTO)|\bPNRR\b'), R(r'bando|domanda|contribut|pnrr')),
    ('Gasolio-agricolo', '08 Contributi e bandi', 'Gasolio agricolo (UMA)', R(r'\bU\.?M\.?A\.?\b|CARBURANTE AGRICOLO|GASOLIO AGRICOLO|ASSEGNAZIONE (DI )?CARBURANTE'), R(r'\buma|gasolio|carburant')),
    ('PAC', '08 Contributi e bandi', 'PAC e fascicolo AGEA', R(r'\bAGEA\b|DOMANDA UNICA|FASCICOLO AZIENDALE|\bPAC\b|\bSIAN\b'), R(r'\bpac\b|agea|fascicolo')),
    ('Fitofarmaci', '12 Campagna', 'Fitofarmaci e concimi', R(r'SCHEDA (DATI )?DI SICUREZZA|FITOSANITAR|PRODOTTI FITOSANITARI|PATENTINO'), R(r'\bsds\b|scheda.?sicurezza|etichett')),
    ('Quaderno-di-campagna', '12 Campagna', 'Quaderno di campagna', R(r'QUADERNO DI CAMPAGNA|REGISTRO DEI TRATTAMENTI'), R(r'quaderno')),
    ('Analisi', '12 Campagna', 'Analisi', R(r'RAPPORTO DI PROVA|CERTIFICATO DI ANALISI|ANALISI (DEL TERRENO|CHIMICA|MICROBIOLOGICA)|POTABILIT'), R(r'analisi|rdp')),
    ('Controllo-AIA', '11 Stalla e animali', 'Controlli AIA e Si@lleva', R(r'SI@LLEVA|SIALLEVA|CONTROLLO FUNZIONALE|ASSOCIAZIONE (ITALIANA )?ALLEVATORI|\bARAV\b'), R(r'sialleva|aia')),
    ('Movimentazione-animali', '11 Stalla e animali', 'Movimentazione animali (UVAC)', R(r'\bUVAC\b|MOVIMENTAZIONE (DEI )?(CAPI|ANIMALI|BOVINI)|DICHIARAZIONE DI PROVENIENZA'), R(r'uvac|modello.?4\b|mod4')),
    ('Anagrafe-bovina', '11 Stalla e animali', 'Anagrafe, registro e passaporti', R(r'ANAGRAFE (BOVINA|ZOOTECNICA)|\bBDN\b|PASSAPORTO (BOVINO|DEL BOVINO|DELL.ANIMALE)|REGISTRO DI STALLA|CAPI BOVINI'), R(r'passaport|anagrafe|registro.?(di.?)?stalla')),
    ('Benessere-animale', '11 Stalla e animali', 'Benessere e ClassyFarm', R(r'CLASSYFARM|BENESSERE ANIMALE|BIOSICUREZZA'), R(r'classyfarm|benessere')),
    ('Veterinario', '11 Stalla e animali', 'Veterinario e ASUFC', R(r'\bASUFC\b|AZIENDA SANITARIA|SERVIZIO VETERINARIO|DIPARTIMENTO DI PREVENZIONE|RICETTA (ELETTRONICA )?VETERINARIA'), R(r'asufc|veterinar|ricetta')),
    ('Latte', '11 Stalla e animali', 'Latte e Parmalat', R(r'PARMALAT|LACTALIS|CELLULE SOMATICHE|CARICA BATTERICA|QUALIT. DEL LATTE|PAGAMENTO LATTE|QUOTAZION.{0,20}LATTE'), R(r'latte|parmalat')),
    ('Alimentazione', '11 Stalla e animali', 'Alimentazione e materie prime', R(r'\bMANGIM[EI]\b|\bMATERIE PRIME\b|\bRAZIONE\b|\bINTEGRATORE\b|ALIMENTO COMPLEMENTARE|\bFIENO\b|\bINSILATO\b|\bPASTONE\b'), R(r'mangim|\brazion|pastone|materie')),
    ('Rifiuti', '14 Ambiente, sicurezza e controlli', 'Rifiuti (FIR e RENTRI)', R(r'FORMULARIO (DI )?IDENTIFICAZIONE|IDENTIFICAZIONE DEL RIFIUTO|\bRENTRI\b|CODICE (EER|CER)\b'), R(r'\bfir\b|rifiut|rentri')),
    ('AUA-PUA', '14 Ambiente, sicurezza e controlli', 'AUA e PUA', R(r'AUTORIZZAZIONE UNICA AMBIENTALE|\bAUA\b|\bPUA\b|UTILIZZAZIONE AGRONOMICA|EFFLUENTI|DIRETTIVA NITRATI'), R(r'\baua\b|\bpua\b|effluent|nitrat')),
    ('Sicurezza-lavoro', '14 Ambiente, sicurezza e controlli', 'Sicurezza sul lavoro', R(r'\bDVR\b|VALUTAZIONE DEI RISCHI|\bRSPP\b|MEDICO COMPETENTE|D\.?\s?LGS\.?\s?81'), R(r'\bdvr\b|sicurezza|rspp')),
    ('Verbale', '14 Ambiente, sicurezza e controlli', 'Verbali e ispezioni', R(r'VERBALE DI (ACCERTAMENTO|ISPEZIONE|SOPRALLUOGO|CONTESTAZIONE)|CARABINIERI|\bN\.?A\.?S\.?\b'), R(r'verbal')),
    ('Verifica-periodica', '13 Mezzi e attrezzature', 'Revisioni e verifiche periodiche', R(r'VERIFICA PERIODICA|MESSA A TERRA|APPARECCHI DI SOLLEVAMENTO'), R(r'verific')),
    ('Revisione', '13 Mezzi e attrezzature', 'Revisioni e verifiche periodiche', R(r'\bREVISIONE\b.{0,40}(VEICOLO|MEZZO|MACCHINA)|MOTORIZZAZIONE'), R(r'revision')),
    ('Multa', '13 Mezzi e attrezzature', 'Telepass e multe', R(r'CODICE DELLA STRADA|VIOLAZIONE.{0,30}ART\.'), R(r'multa|contravven')),
    ('Telepass', '13 Mezzi e attrezzature', 'Telepass e multe', R(r'TELEPASS'), R(r'telepass')),
    ('Libretto', '13 Mezzi e attrezzature', 'Auto e veicoli', R(r'CARTA DI CIRCOLAZIONE|LIBRETTO DI CIRCOLAZIONE|TASSA AUTOMOBILISTICA|BOLLO AUTO'), R(r'librett|bollo|circolaz')),
    ('Rapportino', '13 Mezzi e attrezzature', 'Manutenzioni e rapportini', R(r'RAPPORTINO|RAPPORTO DI INTERVENTO|INTERVENTO TECNICO|BUONO DI LAVORO'), R(r'rapportin')),
    ('Trattore', '13 Mezzi e attrezzature', 'Trattori', R(r'\bTRATTRICE\b|\bTRATTORE\b|JOHN DEERE|NEW HOLLAND|\bFENDT\b|MASSEY FERGUSON'), R(r'trattor')),
    ('Corso', '15 Corsi e formazione', None, R(r'ATTESTATO DI (PARTECIPAZIONE|FREQUENZA)|CORSO DI (FORMAZIONE|AGGIORNAMENTO)'), R(r'attestat|corso')),
    ('Ricevuta-PEC', '01 Società e soci', 'Camera di commercio e PEC', R(r'RICEVUTA DI (AVVENUTA CONSEGNA|ACCETTAZIONE)|POSTA (ELETTRONICA )?CERTIFICATA'), R(r'notificapec|\bpec\b|daticert')),
    ('Documento-identita', '01 Società e soci', 'Documenti dei soci', R(r'CARTA D.IDENTIT|PATENTE DI GUIDA|TESSERA SANITARIA'), R(r'carta.?(d.?)?identit|\bci\b|patente|tessera')),
    ('Preventivo', '06 Contratti, fornitori e utenze', 'Preventivi', R(r'\bPREVENTIVO\b|OFFERTA (ECONOMICA|COMMERCIALE|N\.?)'), R(r'preventiv|offerta')),
    ('Bolletta', '06 Contratti, fornitori e utenze', 'Utenze', R(r'BOLLETTA|FORNITURA DI (ENERGIA|GAS)|SERVIZIO IDRICO|\bCAFC\b|\bTIM\b|\bEOLO\b|FASTWEB|VODAFONE'), R(r'bollett|utenz')),
    ('Contratto', '06 Contratti, fornitori e utenze', 'Contratti di fornitura e servizi', R(r'\bCONTRATTO\b'), R(r'contratt')),
    ('Delega', '01 Società e soci', 'Deleghe e mandati', R(r'\bDELEGA\b|\bMANDATO\b|\bPROCURA\b'), R(r'deleg|mandat')),
    ('Bando', '08 Contributi e bandi', 'Altri contributi e statistiche', R(r'\bBANDO\b'), None),
    ('Manuale', '99 Varie e da smistare', 'Manuali e programmi', R(r'MANUALE (UTENTE|D.USO|DI ISTRUZIONI)|ISTRUZIONI PER L.USO|GUIDA ALL.UTILIZZO'), R(r'manual')),
]

# Enti pubblici e aziende note (nomi pubblici, non dati personali): la prima trovata in alto nel testo è la controparte.
ENTI = [
    (R(r'AGENZIA DELLE ENTRATE.{0,3}RISCOSSIONE'), 'AdE-Riscossione'), (R(r'AGENZIA DELLE ENTRATE'), 'Agenzia-Entrate'),
    (R(r'\bINPS\b|ISTITUTO NAZIONALE (DELLA )?PREVIDENZA'), 'INPS'), (R(r'\bINAIL\b'), 'INAIL'), (R(r'\bAGEA\b'), 'AGEA'),
    (R(r'\bISMEA\b'), 'ISMEA'), (R(r'\bASUFC\b|AZIENDA SANITARIA UNIVERSITARIA FRIULI'), 'ASUFC'),
    (R(r'REGIONE AUTONOMA FRIULI|REGIONE FVG|REGIONE FRIULI'), 'Regione-FVG'), (R(r'PARMALAT|LACTALIS'), 'Parmalat'),
    (R(r'E-DISTRIBUZIONE|E DISTRIBUZIONE'), 'E-Distribuzione'), (R(r'\bENEL\b'), 'Enel'), (R(r'\bGSE\b|GESTORE DEI SERVIZI ENERGETICI'), 'GSE'),
    (R(r'\bCAFC\b'), 'CAFC'), (R(r'BANCA 360|BANCATER'), 'Banca-360'), (R(r'CREDIFRIULI'), 'CrediFriuli'),
    (R(r'CREDIT AGRICOLE|FRIULADRIA'), 'Credit-Agricole'), (R(r'CAMERA DI COMMERCIO'), 'Camera-di-Commercio'),
    (R(r'CONSORZIO AGRARIO'), 'Consorzio-Agrario'), (R(r'COLDIRETTI'), 'Coldiretti'), (R(r'\bTELEPASS\b'), 'Telepass'),
    (R(r'\bTIM\b|TELECOM ITALIA'), 'TIM'), (R(r'\bEOLO\b'), 'Eolo'), (R(r'\bARAV\b|ASSOCIAZIONE ALLEVATORI'), 'Allevatori-FVG'),
    (R(r'COMUNE DI ([A-Z][A-Za-zÀ-ÿ\']+)'), None),   # → Comune-di-Xxx
]
COMUNE = R(r'COMUNE DI ([A-Z][A-Za-zÀ-ÿ\']+)')

FORME = R(r'\b(S\.?R\.?L\.?S?|S\.?P\.?A\.?|S\.?N\.?C\.?|S\.?A\.?S\.?|S\.?S\.?|SOC\.? ?COOP|SOCIET[AÀ]|COOPERATIVA|CONSORZIO|STUDIO|DITTA)\b')
NON_NOMI = R(r'^(FATTURA|DOCUMENTO|PAGINA|PAG\.|SPETT|DATA|NUMERO|N\.|TOTALE|COPIA|ORIGINALE|CLIENTE|DESTINATARIO|MITTENTE|OGGETTO|TEL|FAX|E-?MAIL|WWW|VIA|P\.? ?IVA|PARTITA|C\.?F\.?|CODICE)')

MESI = {m: i for i, m in enumerate(['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
                                    'settembre', 'ottobre', 'novembre', 'dicembre'], 1)}
DATA_NUM = re.compile(r'\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b')
DATA_ISO = re.compile(r'\b(20\d{2}|19\d{2})-(\d{2})-(\d{2})\b')
DATA_TXT = re.compile(r'\b(\d{1,2})\s+(' + '|'.join(MESI) + r')\s+(\d{4})\b', re.I)
ETICHETTE_DATA = re.compile(r'(?i)(data (del )?documento|data fattura|data emissione|data:?|\bdel\b|emess[oa] il|in data|lì|li,|udine,|povoletto,)\s*$')


def _data(g, m, a):
    try:
        a = int(a); a = a + 2000 if a < 100 and a <= OGGI.year % 100 + 1 else (a + 1900 if a < 100 else a)
        d = dt.date(a, int(m), int(g))
    except ValueError:
        return None
    if d.year < 1990 or d > OGGI + dt.timedelta(days=60):
        return None
    return d


def trova_date(testo):
    """Date nel testo, in ordine di comparsa: [(posizione, data, ha_etichetta)]."""
    out = []
    for rx, conv in ((DATA_NUM, lambda m: _data(m[1], m[2], m[3])), (DATA_ISO, lambda m: _data(m[3], m[2], m[1])),
                     (DATA_TXT, lambda m: _data(m[1], MESI[m[2].lower()], m[3]))):
        for m in rx.finditer(testo):
            d = conv(m)
            if d:
                prima = testo[max(0, m.start() - 30):m.start()]
                out.append((m.start(), d, bool(ETICHETTE_DATA.search(prima))))
    return sorted(out)


def data_dal_nome(nome):
    for rx, ordine in ((r'(20\d{2})(\d{2})(\d{2})', 'amg'), (r'(\d{2})[_.\-](\d{2})[_.\-](20\d{2})', 'gma'),
                       (r'(20\d{2})[_.\-](\d{2})[_.\-](\d{2})', 'amg'), (r'(\d{2})(\d{2})(20\d{2})(?!\d)', 'gma')):
        for m in re.finditer(rx, nome):
            a, mm, g = (m[1], m[2], m[3]) if ordine == 'amg' else (m[3], m[2], m[1])
            d = _data(g, mm, a)
            if d:
                return d
    return None


def scegli_data(testo, nome, anno_file=None):
    """Data del documento: con etichetta nel testo > nel nome del file > prima data plausibile nel testo.
    anno_file (anno di modifica del file) scarta le date troppo vecchie (nascite, leggi, scadenze lontane)."""
    testa = testo[:2500]
    date = trova_date(testa)
    vicino = lambda d, anni: anno_file is None or (anno_file - anni <= d.year <= anno_file + 1)
    con_etich = [d for _, d, e in date if e and vicino(d, 15)]
    if con_etich:
        return con_etich[0], 'testo'
    d = data_dal_nome(nome)
    if d:
        return d, 'nome'
    plausibili = [d for _, d, e in date if vicino(d, 6)]
    if plausibili:
        return plausibili[0], 'testo'
    return None, None


def anno_dal_percorso(percorso):
    anni = re.findall(r'(?<!\d)(20[0-2]\d|19[9]\d)(?!\d)', os.path.dirname(percorso))
    return int(anni[-1]) if anni else None


CODA_INUTILE = re.compile(r'^(doc|det|docfile|com\d*|scan|img|pdf|xml|gz|signed|firmato|copia|ok|def|rev\d*|v\d+|[a-z]{0,3}\d{2,}|\d{1,3})$', re.I)


def pulisci_descrizione(d):
    """Toglie dalla descrizione i pezzi che non dicono niente (codici, 'doc', 'signed', numeri brevi)."""
    if not d:
        return None
    d = re.sub(r"[()\[\]'’°`]", ' ', d)
    parti = [p for p in re.split(r'[-\s_]+', d) if p and not CODA_INUTILE.match(p)]
    out = '-'.join(parti).strip('-.')
    return out[:50] if re.search(r'[A-Za-zÀ-ÿ]{3,}', out) else None


def pulisci_nome(s, maxlen=40):
    s = re.sub(r'[\\/:*?"<>|]', ' ', s)
    s = re.sub(r'[\s_]+', '-', s.strip())
    s = re.sub(r'-{2,}', '-', s).strip('-.')
    return s[:maxlen].rstrip('-.')


GENERICI = R(r'^(doc\d+|scan|scansione|img|image|immagine|dsc|cam\s?scanner|docfile|documento|file|nuovo|download|'
             r'ricevuta|sharp|mfp|pdfsam|merge|signed|whatsapp|screenshot|[a-f0-9]{16,}|\d+)$')


VUOTE = {'del', 'di', 'da', 'n', 'nr', 'num', 'e', 'per', 'il', 'la', 'lo', 'le', 'a', 'al', 'the', 'pdf', 'ss', 's.s',
         'soc', 'societa', 'società', 'semplice', 'agricola', 'az', 'agr', 'azienda', 'spa', 'srl'}


def descrizione_da_nome(nome, togliere=(), tipo=None):
    """Il nome originale, se dice qualcosa (non è un nome di scanner, un numero o un codice).
    togliere: parole da non ripetere (nome dell'azienda, già implicito); tipo: già nel nome proposto."""
    base = os.path.splitext(nome)[0]
    base = re.sub(r'\(\d+\)|copia( di)?|- ?copia', ' ', base, flags=re.I)
    base = re.sub(r'(?<!\d)\d{8,}(?!\d)', ' ', base)              # numeri lunghi e date compatte
    base = re.sub(r'\d{1,2}[_.\-]\d{1,2}[_.\-]\d{2,4}([_ .\-]\d{1,2}){0,3}', ' ', base)
    parole = [p for p in re.split(r'[\s_\-.+,]+', base) if p]
    via = {x.lower() for x in togliere} | VUOTE | ({w.lower() for w in tipo.split('-')} if tipo else set())
    utili = [p for p in parole if not GENERICI.match(p) and p.lower() not in via]
    lettere = sum(1 for p in utili if re.search(r'[A-Za-zÀ-ÿ]{3,}', p))
    if lettere < 1:
        return None
    return pulisci_nome(' '.join(utili), 50)


BANCHE = {'Banca-360', 'CrediFriuli', 'Credit-Agricole'}


def _intestazione(testa, nomi_azienda):
    """Le prime righe con una forma societaria (srl, spa…), che non siano l'azienda stessa."""
    for riga in testa.split('\n')[:12]:
        r = riga.strip()
        if len(r) < 4 or NON_NOMI.match(r) or any(n in r.upper().replace(' ', '') for n in (x.replace(' ', '') for x in nomi_azienda)):
            continue
        if FORME.search(r) and re.search(r'[A-Za-z]{3,}', r):
            r = re.sub(r'^(Denominazione|Ragione sociale|Ditta|Cliente|Fornitore)\s*:?\s*', '', r, flags=re.I)
            r = re.split(r'\s{2,}|\s[-–|]\s|P\.? ?IVA|PARTITA|C\.F\.|VIA |SEDE|TEL', r, flags=re.I)[0]
            r = pulisci_nome(r.title(), 30)
            if len(r) >= 4:
                return r
    return None


CEDENTE = re.compile(r'Cedente/prestatore[\s\S]{0,300}?(?:Denominazione|Cognome nome)\s*:\s*([^\n:]{3,60}?)\s+(?:Regime|Indirizzo|Codice|$)', re.I)
CESSIONARIO = re.compile(r'Cessionario/committente[\s\S]{0,300}?(?:Denominazione|Cognome nome)\s*:\s*([^\n:]{3,60}?)\s+(?:Regime|Indirizzo|Codice|$)', re.I)


def controparte(testo, nomi_azienda, area=None):
    """Chi ha emesso il documento. Le banche contano solo per i documenti bancari: altrimenti sono
    quasi sempre le coordinate di pagamento stampate in fondo a fatture e preventivi."""
    testa = testo[:1500]
    # fattura elettronica: il fornitore è scritto in chiaro (se siamo noi, conta il cliente)
    m = CEDENTE.search(testa)
    if m:
        nome = m[1].strip()
        if any(n.replace(' ', '') in nome.upper().replace(' ', '') for n in nomi_azienda):
            m2 = CESSIONARIO.search(testo[:3000])
            nome = m2[1].strip() if m2 else ''
        if nome:
            return pulisci_nome(nome.title(), 30)
    banca_ok = bool(area and area.startswith('04'))
    intest = _intestazione(testa, nomi_azienda) if area and area[:2] in ('03', '06') else None
    if intest:
        return intest
    for rx, nome in ENTI:
        m = rx.search(testa)
        if m:
            if nome is None:
                return 'Comune-di-' + m[1].capitalize()
            if nome in BANCHE and not banca_ok:
                continue
            if nome == 'Agenzia-Entrate' and area and area[:2] in ('03', '06'):
                continue      # nelle fatture è solo il testo standard sull'imposta di bollo
            return nome
    return _intestazione(testa, nomi_azienda)


def vendita_o_acquisto(testo, percorso, nomi_azienda):
    p = percorso.lower()
    if re.search(r'[\\/]vendit', p):
        return 'Vendite'
    if re.search(r'[\\/]acquist', p):
        return 'Acquisti'
    t = testo[:3000].upper()
    nostro = min((t.find(n) for n in nomi_azienda if n in t), default=-1)
    if nostro < 0:
        return 'Acquisti'
    m = re.search(r'SPETT|CESSIONARIO|COMMITTENTE|DESTINATARIO|INTESTATARIO|CLIENTE', t)
    if m and nostro < m.start() and re.search(r'CEDENTE|PRESTATORE|MITTENTE|EMITTENTE', t[:m.start()] + ' ') is None:
        # il nostro nome è in testa, prima del destinatario: siamo noi a emettere
        return 'Vendite'
    if m and nostro < m.start() and t.find('CEDENTE') >= 0 and t.find('CEDENTE') < nostro:
        return 'Vendite'
    return 'Acquisti'


def persona_in(testo, nome, persone):
    t = (nome + ' ' + testo[:4000]).upper()
    for p in persone:
        parti = p.upper().split()
        if len(parti) >= 2 and all(re.search(r'\b' + re.escape(x) + r'\b', t) for x in parti):
            return p
    return None


def regola(testo, nome):
    testa, tutto = testo[:1500], testo[:6000]
    nl = nome.lower()
    for rx, tipo, area, sotto in NOMI_DECISIVI:
        if rx.search(nl):
            return tipo, area, sotto, 'testo'      # affidabile quanto il testo
    for zona in (testa, tutto):
        for tipo, area, sotto, rx, rxn in REGOLE:
            if rx.search(zona):
                return tipo, area, sotto, 'testo'
    for tipo, area, sotto, rx, rxn in REGOLE:
        if rxn and rxn.search(nl):
            return tipo, area, sotto, 'nome'
    return None, None, None, None


def nome_proposto(data, anno, tipo, contro, descr, est):
    if data:
        parti = [data.isoformat()]
    elif anno:
        parti = [str(anno)]
    else:
        parti = []
    for x in (tipo, contro, descr):
        if x and not any(x.lower() in p.lower() for p in parti):
            parti.append(pulisci_nome(x, 50))
    if len(parti) <= (1 if (data or anno) else 0):
        return None
    return '_'.join(p for p in parti if p)[:120] + est


def classifica(info, mappa_fn, persone, nomi_azienda):
    """info: dict con testo, esito, genere, percorsi. Ritorna il dict della classificazione."""
    testo = info['testo'] or ''
    percorsi = info['percorsi']
    # 1. cartella
    dalla_cartella = None
    for p in sorted(percorsi, key=lambda p: ('AZIENDA' not in p.upper(), len(p))):
        m = mappa_fn(p)
        if m:
            dalla_cartella = (p, m); break
    percorso = dalla_cartella[0] if dalla_cartella else percorsi[0]
    nome = os.path.basename(percorso)
    est = os.path.splitext(nome)[1].lower()
    tipo, r_area, r_sotto, fonte_tipo = regola(testo, nome)

    area = sotto = None; fonte = None
    if dalla_cartella:
        m = dalla_cartella[1]
        if m['sotto'] not in ('Da verificare',) and not m['nota'].startswith('si smista'):
            area, sotto, fonte = m['area'], (m['sotto'] or None), 'cartella'
            if m.get('persona'):
                info['persona_cartella'] = m['persona']
    if not area and tipo:
        area, sotto, fonte = r_area, r_sotto, 'regole-' + fonte_tipo
    if area == '03 Fatture' and (sotto in (None, 'Acquisti', 'Vendite')):
        sotto = vendita_o_acquisto(testo, percorso, nomi_azienda)

    anno_file = dt.date.fromtimestamp(info['modificato']).year if info.get('modificato') else None
    d, fonte_data = scegli_data(testo, nome, anno_file)
    anno = d.year if d else anno_dal_percorso(percorso)
    persona = info.get('persona_cartella') or (persona_in(testo, nome, persone) if area in ('05 Personale', '02 Fisco e contabilità', None) or tipo in ('CU', 'Busta-paga', 'Documento-identita') else None)
    if tipo == 'Documento-identita' and persona and area == '01 Società e soci':
        area, sotto = '05 Personale', 'Dipendenti'
    contro = persona if (persona and area == '05 Personale') else controparte(testo, nomi_azienda, area)
    parole_azienda = {w for n in nomi_azienda for w in re.split(r'\W+', n) if w}
    descr = descrizione_da_nome(nome, parole_azienda | set(re.split(r'\W+', contro or '')), tipo)

    if info['genere'] == 'immagine' and len(re.sub(r'\W', '', testo)) < 40 and not area:
        area, sotto, fonte, tipo = '99 Varie e da smistare', 'Foto non documenti', 'regole-foto', 'Foto'
    if not area:
        area, sotto = '99 Varie e da smistare', 'Da verificare'
        fonte = 'nessuna'

    if fonte == 'cartella':
        conf = 'alta' if (d or anno) else 'media'
    elif fonte and fonte.startswith('regole-testo') and d and est not in ('.xlsx', '.xls', '.xlsm', '.csv', '.ods'):
        conf = 'media'      # i fogli di calcolo sono riepiloghi: le parole chiave ingannano, li guarda qualcuno
    elif fonte and fonte.startswith('regole'):
        conf = 'bassa' if fonte != 'regole-foto' else 'media'
    else:
        conf = 'bassa'
    return {
        'area': area, 'sotto': sotto, 'tipo': tipo, 'data_doc': d.isoformat() if d else None, 'anno': anno,
        'controparte': contro, 'persona': persona, 'descrizione': descr, 'confidenza': conf,
        'nome_proposto': nome_proposto(d, anno, tipo or None, contro, descr, est), 'fonte': fonte,
        'fonte_data': fonte_data, 'percorso_scelto': percorso,
    }
