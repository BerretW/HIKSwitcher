# FÁZE 1: Build aplikace (Node.js)
FROM node:20-alpine as build-stage

# Nastavíme pracovní adresář
WORKDIR /app

# Zkopírujeme definice závislostí
COPY frontend/package*.json ./

# Nainstalujeme závislosti
RUN npm install

# Zkopírujeme zbytek zdrojových kódů
COPY frontend/ .

# Sestavíme aplikaci pro produkci (vytvoří složku dist)
RUN npm run build

# FÁZE 2: Web server (Nginx)
FROM nginx:alpine as production-stage

# Zkopírujeme sestavenou aplikaci z první fáze do Nginx složky
COPY --from=build-stage /app/dist /usr/share/nginx/html

# Zkopírujeme naši konfiguraci Nginx (pro SPA routing)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Otevřeme port 80
EXPOSE 80

# Spustíme Nginx
CMD ["nginx", "-g", "daemon off;"]