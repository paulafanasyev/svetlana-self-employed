#!/usr/bin/env bash
# Выпустить HTTPS, когда A-записи доменов уже смотрят на этот сервер.
set -euo pipefail
: "${CERT_EMAIL:?Нужен CERT_EMAIL}"
MIR_DOMAIN="${MIR_DOMAIN:-xn----8sba1acxdkgqms3b9euc.xn--p1ai}"
YZ_DOMAIN="${YZ_DOMAIN:-xn----8sbapnu4bzhe.xn--p1ai}"
certbot --nginx --non-interactive --agree-tos -m "$CERT_EMAIL" --redirect \
  -d "$MIR_DOMAIN" -d "www.$MIR_DOMAIN" -d "$YZ_DOMAIN" -d "www.$YZ_DOMAIN"
