# Sitio wellpeak.com.mx · Guía de publicación y actualización

Esta guía es para la persona que administra el servidor de AWS. Arquitectura acordada:

- **EC2 (Nginx)** sirve el sitio como páginas estáticas. El formulario de contacto con **Amazon SES** está preparado en `servidor/` pero **no está implementado por ahora** (secciones 4 y 5).
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
| `servidor/` | Configuración de Nginx. También contiene el servicio del formulario (`contacto.js`, systemd, variables), aún sin implementar. |
| `publicar.sh` | Script para publicar cambios (`git pull` en EC2) y guardar respaldo en S3. |

---

## 1. Preparar la instancia EC2 (una sola vez)

Instancia **t3.micro con Ubuntu 24.04**, una **IP elástica** asociada, el rol `pulse-ec2-role` asignado y el grupo de seguridad con los puertos **80** y **443** abiertos (y **22 solo para tu IP**).

```bash
ssh -i ~/.ssh/wellpeak.pem ubuntu@IP_DEL_SERVIDOR

# Paquetes base y actualizaciones de seguridad automáticas
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx git ufw unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Swap de 1 GB (la t3.micro solo tiene 1 GB de RAM)
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Firewall
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw --force enable
```

## 2. Clonar el repositorio en un directorio seguro

El sitio vive en `/srv/wellpeak`, propiedad de un usuario `deploy` **sin sudo** que solo puede leer el repositorio. Nginx (`www-data`) solo tiene permiso de lectura.

```bash
# Usuario deploy (actualiza el código)
sudo adduser --system --group --home /home/deploy --shell /bin/bash deploy

# Llave de solo lectura para GitHub
sudo -u deploy mkdir -m 700 -p /home/deploy/.ssh
sudo -u deploy ssh-keygen -t ed25519 -N "" -f /home/deploy/.ssh/id_ed25519 -C "wellpeak-ec2"
sudo cat /home/deploy/.ssh/id_ed25519.pub
```

Copia esa llave en GitHub → repositorio `wellpeak-web` → **Settings → Deploy keys → Add deploy key** (deja **sin marcar** "Allow write access").

```bash
# Clonar
sudo mkdir -p /srv/wellpeak && sudo chown deploy:deploy /srv/wellpeak
sudo -u deploy ssh-keyscan github.com | sudo -u deploy tee /home/deploy/.ssh/known_hosts
sudo -u deploy git clone git@github.com:otreborbckd/wellpeak-web.git /srv/wellpeak

# Permisos: solo deploy escribe; los demás leen
sudo chmod 755 /srv/wellpeak
sudo find /srv/wellpeak -path /srv/wellpeak/.git -prune -o -type d -exec chmod 755 {} + -o -type f -exec chmod 644 {} +
sudo chmod 700 /srv/wellpeak/.git

# Nginx
sudo cp /srv/wellpeak/servidor/nginx-wellpeak.conf /etc/nginx/sites-available/wellpeak
sudo ln -sf /etc/nginx/sites-available/wellpeak /etc/nginx/sites-enabled/wellpeak
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

La configuración de Nginx sirve directamente el clon, pero responde 404 a `.git/`, `servidor/`, `descargas/`, `*.md`, `*.sh` y archivos de configuración. Compruébalo:

```bash
curl -s -o /dev/null -w "%{http_code}
" http://localhost/ -H "Host: wellpeak.com.mx"                  # 200
curl -s -o /dev/null -w "%{http_code}
" http://localhost/.git/config -H "Host: wellpeak.com.mx"        # 404
curl -s -o /dev/null -w "%{http_code}
" http://localhost/servidor/contacto.js -H "Host: wellpeak.com.mx" # 404
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

## 4. Amazon SES (correo del formulario) · NO IMPLEMENTADO POR AHORA

> Omitir esta sección y la 5 mientras el sitio funcione solo como páginas estáticas. Para activarlo: instalar Node.js 24 (`curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -` y `sudo apt install -y nodejs`), crear el usuario `wellpeak` (`sudo useradd --system --no-create-home --shell /usr/sbin/nologin wellpeak`), seguir estos pasos y descomentar en `nginx-wellpeak.conf` el bloque `location /api/`.

1. En SES, **verifica el dominio** `wellpeak.com.mx` (agrega los registros DKIM que indica la consola en el DNS).
2. Si la cuenta de SES está en modo *sandbox*, solicita salir de él, o verifica también el correo que recibirá las solicitudes.
3. Crea un **rol de IAM** para la instancia EC2 con este permiso mínimo y asígnalo a la instancia (así no se guardan claves en el servidor):

```json
{
  "Version": "2012-10-17",
  "Statement": [{ "Effect": "Allow", "Action": "ses:SendEmail", "Resource": "*" }]
}
```

## 5. Servicio del formulario · NO IMPLEMENTADO POR AHORA

```bash
# Dependencias (se instalan dentro del clon; Nginx no las sirve)
cd /srv/wellpeak/servidor && sudo -u deploy npm install --omit=dev

# Variables (completar correos y región); solo root y el servicio las leen
sudo mkdir -p /etc/wellpeak
sudo cp /srv/wellpeak/servidor/contacto.env.ejemplo /etc/wellpeak/contacto.env
sudo chown root:wellpeak /etc/wellpeak/contacto.env && sudo chmod 640 /etc/wellpeak/contacto.env
sudo nano /etc/wellpeak/contacto.env

# Servicio
sudo cp /srv/wellpeak/servidor/wellpeak-contacto.service /etc/systemd/system/
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
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d wellpeak.com.mx -d www.wellpeak.com.mx
```

Certbot renueva el certificado automáticamente.

## 7. Cómo actualizar datos o hacer cambios

**Datos de contacto, redes o ligas de descarga:**

1. Abre `assets/js/config.js`, escribe el dato entre comillas y guarda. Lo que quede vacío (`""`) no se muestra.
2. Haz commit y `git push`, y luego actualiza el servidor:
   `ssh -i ~/.ssh/wellpeak.pem ubuntu@IP_DEL_SERVIDOR "sudo -u deploy git -C /srv/wellpeak pull --ff-only"`

**Cualquier otro cambio** (textos, programas, secciones nuevas): solicítalo en el proyecto PROGRAMAS WEELPEAK con Claude. Recibirás la nueva versión de la carpeta; haz `git push` y ejecuta `./publicar.sh`, que actualiza el clon en EC2 (`git pull`), guarda un respaldo con fecha en `s3://.../respaldos/` y actualiza los PDF en `descargas/`. Antes de usarlo por primera vez, completa las 4 variables al inicio del script.

**Volver a una versión anterior:** en el servidor, `sudo -u deploy git -C /srv/wellpeak checkout <commit>` (o haz `git revert` y vuelve a publicar). Los respaldos en `respaldos/sitio-FECHA/` quedan como copia adicional.

## 8. Lista de verificación antes de anunciar el sitio

- [ ] Datos de contacto completos en `config.js`.
- [ ] Aviso de privacidad completado y validado por el área jurídica (y recuadro de "borrador" eliminado).
- [ ] Formulario: SES y servicio pendientes de implementar (o formulario oculto de la página).
- [ ] HTTPS activo en `wellpeak.com.mx` y redirección de `www`.
- [ ] Ligas de descarga funcionando.
- [ ] Cifra de Gollwitzer y Sheeran (sección "Por qué funciona") cotejada con el artículo original.
- [ ] Opcional: registrar el sitio en Google Search Console y enviar `sitemap.xml`.
