FROM alpine/git:2.47.2 AS source

ARG BIT_LOGIN_COMMIT=5d537ca6123b405666b82eabc2328b8f4c70b6ca
RUN git clone https://github.com/BIT101-dev/BIT-Login-Python.git /source \
    && cd /source \
    && git checkout --detach "$BIT_LOGIN_COMMIT"
FROM python:3.10-slim

ARG INSTALL_DDDDOCR=1
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    AUTH_DB_PATH=/app/data/auth.db

COPY --from=source /source/server/requirements.txt ./requirements.txt
RUN if [ "$INSTALL_DDDDOCR" = "0" ]; then sed -i '/ddddocr/d' requirements.txt; fi \
    && pip install --no-cache-dir -r requirements.txt

COPY --from=source /source/bit_login/ bit_login/
COPY --from=source /source/server/ server/
COPY --from=source /source/setup.py /source/README.md ./
COPY configure_cors.py /tmp/configure_cors.py
RUN mkdir -p /app/data \
    && chmod 700 /app/data \
    && python /tmp/configure_cors.py /app/server/server.py \
    && rm /tmp/configure_cors.py \
    && pip install --no-cache-dir . \
    && chmod +x server/start.sh

EXPOSE 16384
CMD ["./server/start.sh"]
