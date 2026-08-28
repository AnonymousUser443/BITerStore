# BIT-Login Python production overlay

BITerStore pins `BIT101-dev/BIT-Login-Python` at commit
`5d537ca6123b405666b82eabc2328b8f4c70b6ca`. Apply `cors-env.patch` to that
checkout before building the production service.

Required environment:

```dotenv
ALLOWED_CORS_ORIGINS=https://bit101.cn,http://bit101.cn,https://store.young581.com
REGISTRATION_JWT_PRIVATE_KEY_FILE=/etc/bit-login/registration-private.pem
REGISTRATION_JWT_ALLOWED_AUDIENCES=biterstore
REGISTRATION_JWT_ISSUER=bit-login
REGISTRATION_JWT_TTL=300
REGISTRATION_JWT_KEY_ID=registration-1
```

Generate the Ed25519 key pair on the BIT-Login host. Keep the private key on
that host and copy only the public PEM to BITerStore's `BIT_LOGIN_PUBLIC_KEY_PEM`.

```sh
openssl genpkey -algorithm ED25519 -out /etc/bit-login/registration-private.pem
openssl pkey -in /etc/bit-login/registration-private.pem -pubout -out /etc/bit-login/registration-public.pem
chmod 600 /etc/bit-login/registration-private.pem
```

Back up the existing checkout, service configuration, and challenge SQLite
database before replacing the service. Existing challenges should be allowed
to expire; only challenges created after the upgrade have a usable subject.
