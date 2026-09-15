# BIT-Login Python production overlay

梨苑儿（BITerStore）固定使用 `BIT101-dev/BIT-Login-Python` 的提交
`5d537ca6123b405666b82eabc2328b8f4c70b6ca`. The local Dockerfile clones that
exact commit and replaces its fixed CORS allow-list during the image build.
The build fails closed if the pinned source no longer contains the expected
allow-list block.

Python dependencies default to the Tsinghua PyPI mirror for reliable builds
from the production host. Override the `PIP_INDEX_URL` build argument when a
different trusted index is required.

Required environment:

```dotenv
ALLOWED_CORS_ORIGINS=https://store.young581.com
REGISTRATION_JWT_PRIVATE_KEY_FILE=/etc/bit-login/registration-private.pem
REGISTRATION_JWT_ALLOWED_AUDIENCES=biterstore
REGISTRATION_JWT_ISSUER=bit-login
REGISTRATION_JWT_TTL=300
REGISTRATION_JWT_KEY_ID=registration-1
```

在梨苑儿服务器上生成 Ed25519 密钥对。将私钥保存在不会提交的
`deploy/secrets` 目录中，并仅将公钥 PEM 配置到梨苑儿服务端的
`BIT_LOGIN_PUBLIC_KEY_PEM`。

```sh
mkdir -p deploy/secrets
openssl genpkey -algorithm ED25519 -out deploy/secrets/bit-login-registration-private.pem
openssl pkey -in deploy/secrets/bit-login-registration-private.pem -pubout -out deploy/secrets/bit-login-registration-public.pem
chmod 600 deploy/secrets/bit-login-registration-*.pem
```

Back up the existing checkout, service configuration, and challenge SQLite
database before replacing the service. Existing challenges should be allowed
to expire; only challenges created after the upgrade have a usable subject.

After startup, validate the pinned registration endpoint and production CORS
policy with `verify_runtime.py <base-url> <origin>`.
