param(
  [string]$Empresa = "TNP CENTRAL"
)

$ErrorActionPreference = "Stop"
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$servico = "CicluzIntegracaoVendasKaylane"
$url = "https://fechamento-caixa-pralis.vercel.app"
$envDestino = Join-Path $pasta ".env.producao"
$envOrigem = "C:\Users\Server-Pralis\Documents\integracoes-scripts\.env.producao"
$nssm = "C:\nssm-2.24\win64\nssm.exe"

if (-not (Test-Path -LiteralPath $envOrigem)) {
  throw "Nao encontrei o .env do robo atual em $envOrigem. Nao alterei nada."
}
if (-not (Test-Path -LiteralPath $nssm)) {
  throw "Nao encontrei o NSSM em $nssm. Nao alterei nada."
}

$node = (Get-Command node -ErrorAction Stop).Source

Write-Host ""
Write-Host "Este instalador NAO para nem altera o robo principal." -ForegroundColor Cyan
Write-Host "Ele criara somente o servico $servico para a Kaylane." -ForegroundColor Cyan
Write-Host ""
Write-Host "Cole agora a MESMA chave salva na Vercel em NUXT_INTEGRACAO_VENDAS_CHAVE." -ForegroundColor Yellow
$segredo = Read-Host "Chave da Kaylane" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segredo)
try {
  $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}
if ([string]::IsNullOrWhiteSpace($token)) { throw "A chave nao pode ficar vazia." }

# Reaproveita somente as credenciais de leitura do CREARE ja usadas pelo robo principal.
$linhasCreare = Get-Content -LiteralPath $envOrigem | Where-Object {
  $_ -match '^\s*(SERVIDOR_CREARE_COMPILART|PORTA_CREARE_COMPILART|BANCO_CREARE_COMPILART|USUARIO_CREARE_COMPILART|SENHA_CREARE_COMPILART)\s*='
}
if ($linhasCreare.Count -ne 5) {
  throw "O .env do robo principal nao possui as 5 configuracoes do CREARE esperadas. Nao alterei nada."
}

$conteudo = @(
  '# Gerado pelo instalador. Nao envie este arquivo por WhatsApp, e-mail ou Git.',
  $linhasCreare,
  "EMPRESA=`"$Empresa`"",
  "PRALIS_VENDAS_API_URL=`"$url`"",
  "PRALIS_VENDAS_API_TOKEN=`"$token`"",
  'SYNC_INTERVALO_MINUTOS="1"',
  'SYNC_DIAS_REPROCESSAR="3"',
  'SYNC_LOCK_MAX_MINUTOS="30"',
  'SYNC_RETRY_TENTATIVAS="4"',
  'SYNC_RETRY_BASE_MS="500"',
  'SYNC_ENVIAR_PRODUTOS="true"',
  'SYNC_ENVIAR_VENDAS="true"',
  'SYNC_ESTADO_DIR=".estado-kaylane"'
)
Set-Content -LiteralPath $envDestino -Value $conteudo -Encoding utf8

Push-Location $pasta
try {
  Write-Host "Instalando dependencias do agente Kaylane..." -ForegroundColor Cyan
  & npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci falhou (codigo $LASTEXITCODE)." }

  Write-Host "Testando um ciclo real antes de criar o servico..." -ForegroundColor Cyan
  & $node "--env-file-if-exists=.env.producao" "src/sincronizar.js"
  if ($LASTEXITCODE -ne 0) { throw "O ciclo de teste falhou (codigo $LASTEXITCODE). O servico nao foi criado." }

  & $nssm stop $servico | Out-Null
  & $nssm remove $servico confirm | Out-Null
  & $nssm install $servico $node | Out-Null
  & $nssm set $servico AppDirectory $pasta | Out-Null
  & $nssm set $servico AppParameters "--env-file-if-exists=.env.producao src/loop.js" | Out-Null
  & $nssm set $servico Start SERVICE_AUTO_START | Out-Null
  & $nssm set $servico AppStdout (Join-Path $pasta "logs\\kaylane-saida.log") | Out-Null
  & $nssm set $servico AppStderr (Join-Path $pasta "logs\\kaylane-erro.log") | Out-Null
  & $nssm set $servico AppRotateFiles 1 | Out-Null
  & $nssm start $servico | Out-Null

  Write-Host "" 
  Write-Host "CONCLUIDO: $servico esta ativo e sincroniza a Kaylane a cada 1 minuto." -ForegroundColor Green
  Write-Host "Para conferir: Get-Service $servico" -ForegroundColor Green
} finally {
  Pop-Location
}
