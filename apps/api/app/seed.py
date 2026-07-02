from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Product:
    id: str
    name: str
    price: float
    category: str
    description: str
    image_url: str


BUSINESS_NAME = "Sunrise Coffee"
BUSINESS_TAGLINE = "Fresh coffee, warm smiles."

PERSONALITY = """
You are Eva, a friendly AI cashier at Sunrise Coffee.
Be warm, concise, and helpful. Upsell politely when it makes sense.
Confirm orders clearly before finalizing.
If a customer asks about hours or policies, use your knowledge base.
"""

KNOWLEDGE = [
    "We are open daily from 7:00 AM to 9:00 PM.",
    "Oat milk and almond milk are free substitutions.",
    "We accept cash and card at the counter.",
    "All pastries are baked fresh every morning.",
    "Ask about our loyalty card after the order is confirmed.",
]

PRODUCTS: list[Product] = [
    Product(
        "latte",
        "Latte",
        5.0,
        "Coffee",
        "Espresso with steamed milk.",
        "https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=600&q=80",
    ),
    Product(
        "cappuccino",
        "Cappuccino",
        5.0,
        "Coffee",
        "Equal parts espresso, steamed milk, and foam.",
        "https://images.unsplash.com/photo-1572442388796-11668a67e53d?auto=format&fit=crop&w=600&q=80",
    ),
    Product(
        "americano",
        "Americano",
        4.0,
        "Coffee",
        "Espresso with hot water.",
        "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=600&q=80",
    ),
    Product(
        "mocha",
        "Mocha",
        5.5,
        "Coffee",
        "Espresso, chocolate, and steamed milk.",
        "https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=600&q=80",
    ),
    Product(
        "cold-brew",
        "Cold Brew",
        4.5,
        "Coffee",
        "Slow-steeped iced coffee.",
        "https://images.unsplash.com/photo-1622597467836-f3285f2131b8?auto=format&fit=crop&w=600&q=80",
    ),
    Product(
        "croissant",
        "Butter Croissant",
        3.0,
        "Pastry",
        "Flaky, buttery classic croissant.",
        "https://images.unsplash.com/photo-1555507036-ab1f4038808a?auto=format&fit=crop&w=600&q=80",
    ),
    Product(
        "muffin",
        "Blueberry Muffin",
        3.5,
        "Pastry",
        "Baked fresh with wild blueberries.",
        "https://images.unsplash.com/photo-1606890737304-57a1ca8a5b62?auto=format&fit=crop&w=600&q=80",
    ),
    Product(
        "bagel",
        "Everything Bagel",
        2.5,
        "Pastry",
        "Toasted everything bagel.",
        "https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=600&q=80",
    ),
    Product(
        "sandwich",
        "Egg Sandwich",
        6.5,
        "Food",
        "Egg, cheese, and your choice of bread.",
        "https://images.unsplash.com/photo-1504754524776-8f4f37790ca0?auto=format&fit=crop&w=600&q=80",
    ),
    Product(
        "water",
        "Sparkling Water",
        2.0,
        "Drinks",
        "Chilled sparkling water.",
        "https://images.unsplash.com/photo-1527689368864-3a821dbccc34?auto=format&fit=crop&w=600&q=80",
    ),
]


def build_system_instruction() -> str:
    product_lines = "\n".join(
        f"- {p.name} (${p.price:.2f}, {p.category}): {p.description}" for p in PRODUCTS
    )
    knowledge_lines = "\n".join(f"- {item}" for item in KNOWLEDGE)
    return f"""{PERSONALITY.strip()}

Store: {BUSINESS_NAME} — {BUSINESS_TAGLINE}

Menu:
{product_lines}

Knowledge:
{knowledge_lines}

Use tools to search products, update the order, and confirm when the customer is ready.
Always speak naturally as a cashier would in person.
"""
