#!/usr/bin/env bash
# =====================================================================
# WellPeak · Publicar el sitio en EC2 y guardar una copia en S3
# Uso (desde la carpeta wellpeak-sitio, en una computadora con acceso):
#   ./publicar.sh
# Antes de usarlo, completa las 4 variables siguientes.
# =====================================================================
set -euo pipefail

SERVIDOR="ec2-user@IP_O_DNS_DEL_SERVIDOR"   # Usuario y dirección de la instancia EC2
LLAVE="$HOME/.ssh/wellpeak.pem"             # Llave .pem de la instancia
BUCKET="s3://NOMBRE-DEL-BUCKET"             # Bucket de S3
RUTA_WEB="/var/www/wellpeak"                # Carpeta pública en el servidor

FECHA=$(date +%Y%m%d-%H%M%S)
echo "1/3 · Subiendo el sitio a EC2..."
rsync -avz --delete -e "ssh -i $LLAVE" \
  --exclude servidor/ --exclude publicar.sh --exclude descargas/ --exclude '*.md' \
  ./ "$SERVIDOR:$RUTA_WEB/"

echo "2/3 · Guardando copia de esta versión en S3 ($FECHA)..."
aws s3 sync ./ "$BUCKET/respaldos/sitio-$FECHA/" --exclude "descargas/*" --only-show-errors

echo "3/3 · Actualizando materiales descargables en S3..."
if [ -d descargas ]; then
  aws s3 sync ./descargas/ "$BUCKET/descargas/" --content-type application/pdf --only-show-errors
fi
echo "Listo. Revisa https://wellpeak.com.mx"
