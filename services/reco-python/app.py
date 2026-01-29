import os
from typing import Optional, List

import psycopg2
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

DATABASE_URL = os.getenv("RECO_DB_URL", "postgres://petshop:petshop@localhost:5433/petshop_core?sslmode=disable")
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "*")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in FRONTEND_ORIGIN.split(",")] if FRONTEND_ORIGIN != "*" else ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def fetch_recommendations(user_id: Optional[str], session_id: Optional[str], limit: int) -> List[dict]:
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                WITH base AS (
                  SELECT DISTINCT product_id
                  FROM events
                  WHERE product_id IS NOT NULL
                    AND event_type IN ('view_product','add_to_cart','checkout')
                    AND (
                      (%(user_id)s <> '' AND user_id::text = %(user_id)s)
                      OR (%(session_id)s <> '' AND session_id = %(session_id)s)
                    )
                  ORDER BY product_id
                  LIMIT 20
                ),
                sessions AS (
                  SELECT DISTINCT session_id
                  FROM events
                  WHERE product_id IN (SELECT product_id FROM base)
                    AND session_id IS NOT NULL
                ),
                users AS (
                  SELECT DISTINCT user_id
                  FROM events
                  WHERE product_id IN (SELECT product_id FROM base)
                    AND user_id IS NOT NULL
                ),
                scored AS (
                  SELECT e.product_id, COUNT(*) AS score
                  FROM events e
                  WHERE e.product_id IS NOT NULL
                    AND e.product_id NOT IN (SELECT product_id FROM base)
                    AND (
                      (e.session_id IN (SELECT session_id FROM sessions))
                      OR (e.user_id IN (SELECT user_id FROM users))
                    )
                  GROUP BY e.product_id
                  ORDER BY score DESC
                  LIMIT %(limit)s
                )
                SELECT p.id, p.name, p.description, p.price, p.stock, p.image_url, COALESCE(s.score, 0) AS score
                FROM products p
                JOIN scored s ON s.product_id = p.id
                ORDER BY s.score DESC
                """,
                {"user_id": user_id or "", "session_id": session_id or "", "limit": limit},
            )
            rows = cur.fetchall()
            if rows:
                return [
                    {
                        "id": r[0],
                        "name": r[1],
                        "description": r[2],
                        "price": r[3],
                        "stock": r[4],
                        "image_url": r[5],
                        "score": r[6],
                    }
                    for r in rows
                ]

            cur.execute(
                """
                SELECT p.id, p.name, p.description, p.price, p.stock, p.image_url, COUNT(e.id) AS score
                FROM products p
                LEFT JOIN events e ON e.product_id = p.id AND e.event_type IN ('view_product','add_to_cart')
                GROUP BY p.id
                ORDER BY score DESC, p.created_at DESC
                LIMIT %(limit)s
                """,
                {"limit": limit},
            )
            rows = cur.fetchall()
            return [
                {
                    "id": r[0],
                    "name": r[1],
                    "description": r[2],
                    "price": r[3],
                    "stock": r[4],
                    "image_url": r[5],
                    "score": r[6],
                }
                for r in rows
            ]
    finally:
        conn.close()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/recommendations")
def recommendations(
    user_id: Optional[str] = Query(default=None),
    session_id: Optional[str] = Query(default=None),
    limit: int = Query(default=6, ge=1, le=20),
):
    items = fetch_recommendations(user_id, session_id, limit)
    return {"items": items}

