# BIT-Login Python production overlay

BITerStore pins `BIT101-dev/BIT-Login-Python` at commit
`5d537ca6123b405666b82eabc2328b8f4c70b6ca`. The local Dockerfile clones that
exact commit and replaces its fixed CORS allow-list during the image build.
The build fails closed if the pinned source no longer contains the expected
allow-list block.

Required environment:

```dotenv
ALLOWED_CORS_ORIGINS=https://store.young581.com
REGISTRATION_JWT_PRIVATE_KEY_FILE=/etc/bit-login/registration-private.pem
REGISTRATION_JWT_ALLOWED_AUDIENCES=biterstore
REGISTRATION_JWT_ISSUER=bit-login
REGISTRATION_JWT_TTL=300
REGISTRATION_JWT_KEY_ID=registration-1
```

Generate the Ed25519 key pair on the BITerStore host. Keep the private key in
the ignored `deploy/secrets` directory and configure only the public PEM in
BITerStore's `BIT_LOGIN_PUBLIC_KEY_PEM`.

```sh
mkdir -p deploy/secrets
openssl genpkey -algorithm ED25519 -out deploy/secrets/bit-login-registration-private.pem
openssl pkey -in deploy/secrets/bit-login-registration-private.pem -pubout -out deploy/secrets/bit-login-registration-public.pem
chmod 600 deploy/secrets/bit-login-registration-*.pem
```

Back up the existing checkout, service configuration, and challenge SQLite
database before replacing the service. Existing challenges should be allowed
to expire; only challenges created after the upgrade have a usable subject.
