from __future__ import annotations

from google.genai import types

from app.order_store import OrderStore
from app.seed import PRODUCTS


def _find_product(query: str) -> list[dict]:
    needle = query.lower().strip()
    matches = [
        p
        for p in PRODUCTS
        if needle in p.name.lower()
        or needle in p.category.lower()
        or needle in p.description.lower()
        or needle in p.id.lower()
    ]
    return [
        {
            "id": p.id,
            "name": p.name,
            "price": p.price,
            "category": p.category,
            "description": p.description,
        }
        for p in matches
    ]


def build_tool_declarations() -> list[types.Tool]:
    return [
        types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="search_products",
                    description="Search menu items by name, category, or keyword.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "query": types.Schema(
                                type=types.Type.STRING,
                                description="Search term such as latte, pastry, or coffee.",
                            )
                        },
                        required=["query"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="add_to_order",
                    description="Add a menu item to the customer's order.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "product_id": types.Schema(
                                type=types.Type.STRING,
                                description="Product id from search_products.",
                            ),
                            "quantity": types.Schema(
                                type=types.Type.INTEGER,
                                description="How many to add.",
                            ),
                        },
                        required=["product_id"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="remove_from_order",
                    description="Remove an item from the customer's order.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "product_id": types.Schema(
                                type=types.Type.STRING,
                                description="Product id to remove.",
                            ),
                            "quantity": types.Schema(
                                type=types.Type.INTEGER,
                                description="Optional quantity to remove.",
                            ),
                        },
                        required=["product_id"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="get_order_summary",
                    description="Get the current order items and total.",
                    parameters=types.Schema(type=types.Type.OBJECT, properties={}),
                ),
                types.FunctionDeclaration(
                    name="confirm_order",
                    description="Confirm the order when the customer is ready to checkout.",
                    parameters=types.Schema(type=types.Type.OBJECT, properties={}),
                ),
            ]
        )
    ]


def build_tool_mapping(order_store: OrderStore) -> dict:
    def search_products(query: str) -> dict:
        results = _find_product(query)
        return {"results": results, "count": len(results)}

    def add_to_order(product_id: str, quantity: int = 1) -> dict:
        product = next((p for p in PRODUCTS if p.id == product_id), None)
        if not product:
            matches = _find_product(product_id)
            if len(matches) == 1:
                product = next(p for p in PRODUCTS if p.id == matches[0]["id"])
            else:
                return {"error": f"Unknown product '{product_id}'."}

        return order_store.add_item(
            product_id=product.id,
            name=product.name,
            price=product.price,
            quantity=max(1, quantity),
        )

    def remove_from_order(product_id: str, quantity: int | None = None) -> dict:
        return order_store.remove_item(product_id=product_id, quantity=quantity)

    def get_order_summary() -> dict:
        return order_store.snapshot()

    def confirm_order() -> dict:
        return order_store.confirm()

    return {
        "search_products": search_products,
        "add_to_order": add_to_order,
        "remove_from_order": remove_from_order,
        "get_order_summary": get_order_summary,
        "confirm_order": confirm_order,
    }
