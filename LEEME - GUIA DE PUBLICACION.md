# Sitio wellpeak.com.mx · Guía de publicación y actualización

Esta guía es para la persona que administra el servidor de AWS. Arquitectura acordada:

- **EC2 (Nginx)** sirve el sitio y, mediante un pequeño servicio en Node.js, recibe el formulario de contacto y lo envía por correo con **Amazon SES**.
- **S3** guarda los materiales descargables (folletos en PDF) y una copia de respaldo de cada versión del sitio.

## Contenido de la carpeta

| Archivo o carpeta | Para qué sirve |
|---|---|
| `index.html` | El sitio (una sola página). |
| `aviso-de-privacidad.html` | Aviso de privacidad. **Es un borrador: debe completarlo y validarlo el área jurídica antes de publicar.** |
| `assets/js/config.js` | **Único archivo que se edita** para teléfono, correo, WhatsApp, redes y ligas de descarga. |
| `assets/css`, `assets/js/sitio.js`, `assets/img` | Diseño, funcionamiento e imágenes. No es necesario tocarlos. |
| `robots.txt`, `sitemap.xml` | Para buscadores. |
| `descargas/` | Copia local de los 3 PDF. Ya están en `s3://pulse-wellpeak-recursos/descargas/` y el sitio los consume desde ahí; **no se suben a EC2**. Solo se usa para reemplazar un PDF. |
| `servidor/` | Servicio del formulario (`contacto.js`), configuración de Nginx, servicio de systemd y variables de ejemplo. |
| `publicar.sh` | Script para publicar cambios y guardar respaldo en S3. |

---

## 1. Preparar la instancia EC2 (una sola vez)

Requisitos: Amazon Linux 2023 o Ubuntu 22.04+, una **IP elástica** asociada y el grupo de seguridad con los puertos **80** y **443** abiertos (y 22 solo para tu IP).

```bash
# Amazon Linux 2023
sudo dnf install -y nginx nodejs rsync
# Ubuntu
# sudo apt update && sudo apt install -y nginx nodejs npm rsync

sudo mkdir -p /var/www/wellpeak /opt/wellpeak-contacto /etc/wellpeak
sudo chown -R $USER /var/www/wellpeak
sudo systemctl enable --now nginx
```

Node.js debe ser versión 18 o superior (`node -v`).

## 2. Subir el sitio

Desde la computadora donde está esta carpeta:

```bash
rsync -avz -e "ssh -i ~/.ssh/wellpeak.pem" \
  --exclude servidor/ --exclude descargas/ --exclude publicar.sh --exclude '*.md' \
  ./ ec2-user@IP_DEL_SERVIDOR:/var/www/wellpeak/
```

Configurar Nginx con el archivo `servidor/nginx-wellpeak.conf`:

```bash
sudo cp nginx-wellpeak.conf /etc/nginx/conf.d/wellpeak.conf   # en Ubuntu: /etc/nginx/sites-available/ + enlace en sites-enabled
sudo nginx -t && sudo systemctl reload nginx
```

## 3. Bucket de S3

1. Crea dos prefijos (carpetas) en el bucket: `descargas/` y `respaldos/`.
2. Sube los PDF de la carpeta `descargas/` a `descargas/`.
3. Haz públicos **solo** los archivos de `descargas/`. Ejemplo de política del bucket (deja desactivado el bloqueo de acceso público únicamente lo necesario para esta política):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "DescargasPublicas",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::pulse-wellpeak-recursos/descargas/*"
  }]
}
```

4. Las URL públicas ya están configuradas en `assets/js/config.js`, sección `descargas` (por ejemplo `https://pulse-wellpeak-recursos.s3.amazonaws.com/descargas/folleto-programas-pulse.pdf`). Si se vacían, la sección "Descarga nuestros materiales" no aparece.

`respaldos/` debe permanecer **privado**.

## 4. Amazon SES (correo del formulario)

1. En SES, **verifica el dominio** `wellpeak.com.mx` (agrega los registros DKIM que indica la consola en el DNS).
2. Si la cuenta de SES está en modo *sandbox*, solicita salir de él, o verifica también el correo que recibirá las solicitudes.
3. Crea un **rol de IAM** para la instancia EC2 con este permiso mínimo y asígnalo a la instancia (así no se guardan claves en el servidor):

```json
{
  "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow", "Action": "ses:SendEmail", "Resource": "*" }]
}
```

## 5. Servicio del formulario

```bash
# Copiar archivos del servicio
scp -i ~/.ssh/wellpeak.pem servidor/contacto.js servidor/package.json ec2-user@IP_DEL_SERVIDOR:/opt/wellpeak-contacto/
cd /opt/wellpeak-contacto && npm install --omit=dev

# Variables (completar correos y región)
sudo cp contacto.env.ejemplo /etc/wellpeak/contacto.env
sudo nano /etc/wellpeak/contacto.env

# Usuario de sistema y servicio
sudo useradd --system --no-create-home wellpeak || true
sudo cp wellpeak-contacto.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now wellpeak-contacto
sudo systemctl status wellpeak-contacto
curl http://127.0.0.1:3001/api/salud      # debe responder {"ok":true}
```

Para probar sin enviar correos, pon `MODO_PRUEBA=1` en `contacto.env`, reinicia el servicio y revisa el registro con `journalctl -u wellpeak-contacto -f`.

El servicio valida los datos, tiene un campo trampa contra robots y limita a 5 envíos por IP cada 10 minutos. El correo llega con "Responder a" apuntando al correo del prospecto.

## 6. Dominio y HTTPS

1. En el DNS de `wellpeak.com.mx` (Route 53 o tu proveedor), crea registros **A** para `wellpeak.com.mx` y `www.wellpeak.com.mx` apuntando a la IP elástica.
2. Instala el certificado gratuito con Certbot:

```bash
sudo dnf install -y certbot python3-certbot-nginx    # Ubuntu: sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d wellpeak.com.mx -d www.wellpeak.com.mx
```

Certbot renueva el certificado automáticamente.

## 7. Cómo actualizar datos o hacer cambios

**Datos de contacto, redes o ligas de descarga:**

1. Abre `assets/js/config.js`, escribe el dato entre comillas y guarda. Lo que quede vacío (`""`) no se muestra.
2. Sube solo ese archivo:
   `rsync -avz -e "ssh -i ~/.ssh/wellpeak.pem" assets/js/config.js ec2-user@IP_DEL_SERVIDOR:/var/www/wellpeak/assets/js/`

**Cualquier otro cambio** (textos, programas, secciones nuevas): solicítalo en el proyecto PROGRAMAS WEELPEAK con Claude. Recibirás la nueva versión de la carpeta; después ejecuta `./publicar.sh`, que sube el sitio a EC2, guarda un respaldo con fecha en `s3://.../respaldos/` y actualiza los PDF en `descargas/`. Antes de usarlo por primera vez, completa las 4 variables al inicio del script.

**Volver a una versión anterior:** descarga la carpeta de `respaldos/sitio-FECHA/` y súbela de nuevo con `rsync`.

## 8. Lista de verificación antes de anunciar el sitio

- [ ] Datos de contacto completos en `config.js`.
- [ ] Aviso de privacidad completado y validado por el área jurídica (y recuadro de "borrador" eliminado).
- [ ] SES verificado y formulario probado con un envío real.
- [ ] HTTPS activo en `wellpeak.com.mx` y redirección de `www`.
- [ ] Ligas de descarga funcionando.
- [ ] Cifra de Gollwitzer y Sheeran (sección "Por qué funciona") cotejada con el artículo original.
- [ ] Opcional: registrar el sitio en Google Search Console y enviar `sitemap.xml`.
