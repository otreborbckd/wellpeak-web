#!/usr/bin/env bash
# =====================================================================
# WellPeak · Publicar el sitio en EC2 y guardar una copia en S3
# Uso (desde la carpeta wellpeak-sitio, en una computadora con acceso):
#   git push            # primero sube los cambios a GitHub
#   ./publicar.sh
# Antes de usarlo, completa las 4 variables siguientes.
# =====================================================================
set -euo pipefail

SERVIDOR="ubuntu@IP_O_DNS_DEL_SERVIDOR"     # Usuario y dirección de la instancia EC2
LLAVE="$HOME/.ssh/wellpeak.pem"             # Llave .pem de la instancia
BUCKET="s3://pulse-wellpeak-recursos"       # Bucket de S3
RUTA_WEB="/srv/wellpeak"                    # Clon del repositorio que sirve Nginx

FECHA=$(date +%Y%m%d-%H%M%S)
echo "1/3 · Actualizando el sitio en EC2 desde GitHub..."
ssh -i "$LLAVE" "$SERVIDOR" "sudo -u deploy git -C $RUTA_WEB pull --ff-only"

echo "2/3 · Guardando copia de esta versión en S3 ($FECHA)..."
aws s3 sync ./ "$BUCKET/respaldos/sitio-$FECHA/" --exclude "descargas/*" --exclude ".git/*" --exclude "*/node_modules/*" --only-show-errors

# Los PDF se sirven desde s3://pulse-wellpeak-recursos/descargas/.
# Solo se resincronizan si existe la carpeta local descargas/ (p. ej. al reemplazar un PDF).
echo "3/3 · Actualizando materiales descargables en S3..."
if [ -d descargas ]; then
  aws s3 sync ./descargas/ "$BUCKET/descargas/" --content-type application/pdf --only-show-errors
fi
echo "Listo. Revisa https://wellpeak.com.mx"
