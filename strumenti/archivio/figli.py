"""Processi di lavoro legati al programma che li ha aperti (24/11/2026).

Se il programma principale si chiude, anche perché l'attività di Windows lo ferma allo scadere del tempo, Windows non
chiude i processi della lettura che aveva aperto: restavano accesi per giorni (trovati sei avanzi fermi del 19 e 21/11).
`sorveglia_padre` va passata come `initializer` a ProcessPoolExecutor: ogni processo di lavoro tiene un riferimento al
padre e si chiude da solo appena il padre non c'è più.
"""
import os
import threading


def _aspetta(maniglia):
    import ctypes
    ctypes.windll.kernel32.WaitForSingleObject(maniglia, 0xFFFFFFFF)   # aspetta finché il padre esiste
    os._exit(1)


def sorveglia_padre():
    if os.name != 'nt':
        return
    import ctypes
    SYNCHRONIZE = 0x00100000
    # la maniglia aperta adesso resta legata a quel processo anche se il suo numero venisse riusato dopo
    maniglia = ctypes.windll.kernel32.OpenProcess(SYNCHRONIZE, False, os.getppid())
    if not maniglia:
        os._exit(1)   # il padre è già chiuso
    threading.Thread(target=_aspetta, args=(maniglia,), daemon=True, name='sorveglia-padre').start()
