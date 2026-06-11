# Gunakan image Node.js versi 18 (LTS) sebagai base image
FROM node:18-alpine

# Set working directory di dalam container
WORKDIR /usr/src/app

# Salin file package.json dan package-lock.json terlebih dahulu
# Ini memanfaatkan layer caching Docker untuk mempercepat build jika dependencies tidak berubah
COPY package*.json ./

# Install dependensi aplikasi
RUN npm install

# Salin seluruh kode sumber ke dalam container
COPY . .

# Buat folder uploads jika belum ada, lalu beri akses rwx (opsional namun disarankan)
RUN mkdir -p uploads && chmod 777 uploads

# Ekspos port 3000 yang digunakan oleh aplikasi Express
EXPOSE 3000

# Perintah yang dijalankan ketika container dimulai
CMD [ "npm", "start" ]
