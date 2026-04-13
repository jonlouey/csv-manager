# CSV Manager

A simple CRUD app for uploading and managing CSV files, with an API endpoint for use in data analytics pipelines.

## Run locally

```bash
npm install
npm start
```

Open http://localhost:3000

## API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/files` | List all files |
| `POST` | `/api/files` | Upload a CSV (`multipart/form-data`: `file`, `name`) |
| `GET` | `/api/files/:id/raw` | Fetch raw CSV content |
| `GET` | `/api/files/:id` | Download file |
| `PATCH` | `/api/files/:id` | Rename (`{ name }`) or replace file |
| `DELETE` | `/api/files/:id` | Delete file |

### Example: load a CSV into pandas

```python
import requests, pandas as pd, io

r = requests.get("https://your-deployed-url.com/api/files/<id>/raw")
df = pd.read_csv(io.StringIO(r.text))
```
