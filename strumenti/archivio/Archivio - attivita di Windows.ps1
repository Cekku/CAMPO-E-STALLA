# Attivita di Windows dell'archivio (dell'utente, senza privilegi di amministratore).
#   -Azione installa : crea "Archivio documenti - ponte" e porta "Archivio documenti - file nuovi" a ogni 2 ore (7-21)
#   -Azione togli    : toglie la prima e rimette "file nuovi" ogni giorno alle 12:30 (com'era prima)
#   -Azione stato    : mostra le attivita e quando partono
# Si lancia da "Archivio - ponte (avvio automatico).bat". Nessun percorso personale e' scritto qui:
# tutto si ricava dalla posizione del file e da Python installato.
param([Parameter(Mandatory = $true)][ValidateSet('installa', 'togli', 'stato')][string]$Azione)
$ErrorActionPreference = 'Stop'
$cartella = $PSScriptRoot
$nomePonte = 'Archivio documenti - ponte'
$nomeNuovi = 'Archivio documenti - file nuovi'
$pyw = (Get-Command pythonw.exe -ErrorAction Stop).Source
$utente = "$env:USERDOMAIN\$env:USERNAME"

function Mostra {
    foreach ($n in @($nomePonte, $nomeNuovi, 'Archivio documenti - scansioni vecchie')) {
        $t = Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue
        if (-not $t) { Write-Host "$n : non c'e'"; continue }
        $i = $t | Get-ScheduledTaskInfo
        Write-Host ("{0} : {1}, ultima volta {2}, esito {3}, prossima {4}" -f $n, $t.State, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime)
    }
}

if ($Azione -eq 'stato') { Mostra; return }

if ($Azione -eq 'installa') {
    # 1) guardiano del ponte: all'accesso (dopo 30 s) e poi ogni 15 minuti; se e' gia' acceso non fa niente
    $az = New-ScheduledTaskAction -Execute $pyw -Argument 'ponte-guardiano.py' -WorkingDirectory $cartella
    $t1 = New-ScheduledTaskTrigger -AtLogOn -User $utente
    $t1.Delay = 'PT30S'
    $t2 = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 15)
    $imp = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
        -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -Hidden
    $pr = New-ScheduledTaskPrincipal -UserId $utente -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $nomePonte -Action $az -Trigger @($t1, $t2) -Settings $imp -Principal $pr -Force `
        -Description 'Campo e Stalla: tiene acceso il ponte dell archivio (porta 1236) senza finestre. Registro in ArchivioAzienda\ponte-log.txt.' | Out-Null
    Write-Host "Creata: $nomePonte"

    # 2) file nuovi: dalle 7 alle 21 ogni 2 ore (prima: una volta al giorno alle 12:30). Le altre impostazioni restano.
    $nuovi = Get-ScheduledTask -TaskName $nomeNuovi
    $g = New-ScheduledTaskTrigger -Daily -At '07:00'
    $r = New-ScheduledTaskTrigger -Once -At '07:00' -RepetitionInterval (New-TimeSpan -Hours 2) -RepetitionDuration (New-TimeSpan -Hours 14 -Minutes 30)
    $g.Repetition = $r.Repetition
    Set-ScheduledTask -TaskName $nomeNuovi -Trigger $g | Out-Null
    Write-Host "Cambiata: $nomeNuovi (ogni 2 ore dalle 7 alle 21)"
    Mostra
    return
}

if ($Azione -eq 'togli') {
    if (Get-ScheduledTask -TaskName $nomePonte -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $nomePonte -Confirm:$false
        Write-Host "Tolta: $nomePonte (il guardiano acceso resta finche' non lo spegni con 'Archivio - ponte spegni.bat')"
    }
    $g = New-ScheduledTaskTrigger -Daily -At '12:30'
    Set-ScheduledTask -TaskName $nomeNuovi -Trigger $g | Out-Null
    Write-Host "Rimessa: $nomeNuovi (ogni giorno alle 12:30)"
    Mostra
}
