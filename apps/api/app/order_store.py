from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

OrderStatus = Literal["open", "confirmed"]


@dataclass
class OrderItem:
    product_id: str
    name: str
    price: float
    quantity: int


@dataclass
class Order:
    items: list[OrderItem] = field(default_factory=list)
    status: OrderStatus = "open"

    @property
    def total(self) -> float:
        return sum(item.price * item.quantity for item in self.items)

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "items": [
                {
                    "product_id": item.product_id,
                    "name": item.name,
                    "price": item.price,
                    "quantity": item.quantity,
                    "subtotal": round(item.price * item.quantity, 2),
                }
                for item in self.items
            ],
            "total": round(self.total, 2),
        }


class OrderStore:
    def __init__(self) -> None:
        self._order = Order()

    def reset(self) -> None:
        self._order = Order()

    def snapshot(self) -> dict:
        return self._order.to_dict()

    def add_item(self, product_id: str, name: str, price: float, quantity: int = 1) -> dict:
        if self._order.status == "confirmed":
            return {"error": "Order is already confirmed."}

        for item in self._order.items:
            if item.product_id == product_id:
                item.quantity += quantity
                return {"success": True, "order": self.snapshot()}

        self._order.items.append(
            OrderItem(product_id=product_id, name=name, price=price, quantity=quantity)
        )
        return {"success": True, "order": self.snapshot()}

    def remove_item(self, product_id: str, quantity: int | None = None) -> dict:
        if self._order.status == "confirmed":
            return {"error": "Order is already confirmed."}

        for index, item in enumerate(self._order.items):
            if item.product_id == product_id:
                if quantity is None or quantity >= item.quantity:
                    self._order.items.pop(index)
                else:
                    item.quantity -= quantity
                return {"success": True, "order": self.snapshot()}

        return {"error": f"Product '{product_id}' not found in order."}

    def confirm(self) -> dict:
        if not self._order.items:
            return {"error": "Cannot confirm an empty order."}

        self._order.status = "confirmed"
        return {"success": True, "order": self.snapshot()}
