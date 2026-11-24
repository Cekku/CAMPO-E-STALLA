# Attivita di Windows del controllo della sicurezza (dell'utente, senza privilegi di amministratore).
#   -Azione installa : crea "Campo e Stalla - sicurezza del PC": ogni lunedi alle 7:00 (se il PC era spento, appena si accende)
#   -Azione togli    : la toglie
#   -Azione stato    : mostra quando e' partita e quando parte
# Nessun percorso personale e' scritto qui: tutto si ricava dalla posizione del file e da Python installato.
param([Parameter(Mandatory = $true)][ValidateSet('installa', 'togli', 'stato')][string]$Azione)
$ErrorActionPreference = 'Stop'
$cartella = $PSScriptRoot
$nome = 'Campo e Stalla - sicurezza del PC'
$utente = "$env:USERDOMAIN\$env:USERNAME"

function Mostra {
    $t = Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
    if (-not $t) { Write-Host "$nome : non c'e'"; return }
    $i = $t | Get-ScheduledTaskInfo
    Write-Host ("{0} : {1}, ultima volta {2}, esito {3}, prossima {4}" -f $nome, $t.State, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime)
}

if ($Azione -eq 'stato') { Mostra; return }

if ($Azione -eq 'installa') {
    $pyw = (Get-Command pythonw.exe -ErrorAction Stop).Source
    # -I: Python non carica moduli dalla cartella corrente (prudenza)
    $az = New-ScheduledTaskAction -Execute $pyw -Argument '-I sicurezza-pc.py' -WorkingDirectory $cartella
    $tr = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '07:00'
    $imp = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RunOnlyIfNetworkAvailable -Hidden
    $pr = New-ScheduledTaskPrincipal -UserId $utente -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $nome -Action $az -Trigger $tr -Settings $imp -Principal $pr -Force `
        -Description 'Campo e Stalla: controllo settimanale della sicurezza del PC (porte, antivirus, firewall, aggiornamenti, Python, repository). Resoconto in %LOCALAPPDATA%\CampoEStalla.' | Out-Null
    Write-Host "Creata: $nome (ogni lunedi alle 7:00)"
    Mostra
    return
}

if ($Azione -eq 'togli') {
    if (Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $nome -Confirm:$false
        Write-Host "Tolta: $nome"
    }
}
