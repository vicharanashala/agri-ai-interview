# API Contracts

## POST /auth/signup

Request:

{
  "email": "",
  "password": ""
}

Response:

{
  "access_token": ""
}

---

## POST /auth/login

Request:

{
  "email": "",
  "password": ""
}

Response:

{
  "access_token": ""
}

---

## GET /health

Response:

{
  "status": "ok"
}
