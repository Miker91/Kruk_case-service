# Case Service

Mikroserwis zarządzający sprawami windykacyjnymi (cases) w systemie Kruk S.A.

## Opis

Case Service obsługuje cykl życia spraw windykacyjnych:
- Tworzenie i aktualizacja spraw
- Śledzenie statusu i historii
- Rejestrowanie płatności
- Integracja z payment-service i settlement-service

## API Endpoints

| Metoda | Endpoint | Opis |
|--------|----------|------|
| GET | /api/cases | Lista spraw z filtrami |
| GET | /api/cases/:id | Szczegóły sprawy |
| GET | /api/cases/:id/status | Status sprawy (lekki endpoint) |
| POST | /api/cases | Utwórz sprawę |
| PATCH | /api/cases/:id | Aktualizuj sprawę |
| POST | /api/cases/:id/payments | Zarejestruj płatność |
| GET | /api/cases/:id/history | Historia sprawy |

## Statusy spraw

| Status | Opis | Płatności |
|--------|------|-----------|
| ACTIVE | Aktywna windykacja | ✅ Dozwolone |
| SETTLEMENT | Ugoda w toku | ✅ Dozwolone |
| LEGAL_ACTION | Postępowanie prawne | ❌ Zablokowane |
| CLOSED | Zamknięta | ⚠️ Z weryfikacją |
| WRITTEN_OFF | Umorzona | ⚠️ Powoduje reaktywację |

## Uruchomienie

```bash
# Development
npm install
npm run dev

# Production
npm run build
npm start

# Docker
docker build -t case-service .
docker run -p 3001:3001 case-service
```

## Zmienne środowiskowe

| Zmienna | Domyślna | Opis |
|---------|----------|------|
| PORT | 3001 | Port serwisu |
| RABBITMQ_URL | amqp://localhost:5672 | URL RabbitMQ |

## Przykłady

### Pobranie statusu sprawy

```bash
curl http://localhost:3001/api/cases/CASE-2024-001/status
```

Odpowiedź:
```json
{
  "success": true,
  "data": {
    "caseId": "CASE-2024-001",
    "status": "SETTLEMENT",
    "canAcceptPayments": true
  }
}
```

### Zarejestrowanie płatności

```bash
curl -X POST http://localhost:3001/api/cases/CASE-2024-001/payments \
  -H "Content-Type: application/json" \
  -d '{"paymentId": "PAY-001", "amount": 1500}'
```
