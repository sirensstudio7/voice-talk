package streaming

import "sort"

// OrderStore is a session-scoped, in-memory cart. It's only ever touched
// from the single goroutine that owns a Session's read loop (see
// handler_ws.go), so no mutex is needed — a real concurrency concern only
// once Phase 2 introduces provider-pushed events from a separate
// goroutine.
type OrderStore struct {
	lines map[string]orderLine
}

type orderLine struct {
	ProductID string
	Name      string
	Price     float64
	Quantity  int32
}

func NewOrderStore() *OrderStore {
	return &OrderStore{lines: make(map[string]orderLine)}
}

// AddItem adds quantity of a product to the cart, summing into any
// existing line for that product.
func (s *OrderStore) AddItem(productID, name string, price float64, quantity int32) {
	line, ok := s.lines[productID]
	if !ok {
		line = orderLine{ProductID: productID, Name: name, Price: price}
	}
	line.Quantity += quantity
	s.lines[productID] = line
}

// DecrementItem reduces a line's quantity by one, removing it once it
// reaches zero. Returns false if the product wasn't in the cart.
func (s *OrderStore) DecrementItem(productID string) bool {
	line, ok := s.lines[productID]
	if !ok {
		return false
	}
	line.Quantity--
	if line.Quantity <= 0 {
		delete(s.lines, productID)
		return true
	}
	s.lines[productID] = line
	return true
}

// RemoveItem removes a product's line entirely, regardless of quantity.
// Returns false if the product wasn't in the cart.
func (s *OrderStore) RemoveItem(productID string) bool {
	if _, ok := s.lines[productID]; !ok {
		return false
	}
	delete(s.lines, productID)
	return true
}

// Reduce ports order-store.ts's removeItem(productId, quantity): with a
// positive quantity it reduces the line by that amount (deleting it if
// that reaches zero or below); with quantity <= 0 it removes the line
// entirely, same as RemoveItem. Returns false if the product wasn't in
// the cart.
func (s *OrderStore) Reduce(productID string, quantity int32) bool {
	if quantity <= 0 {
		return s.RemoveItem(productID)
	}
	line, ok := s.lines[productID]
	if !ok {
		return false
	}
	line.Quantity -= quantity
	if line.Quantity <= 0 {
		delete(s.lines, productID)
		return true
	}
	s.lines[productID] = line
	return true
}

func (s *OrderStore) Clear() {
	s.lines = make(map[string]orderLine)
}

func (s *OrderStore) IsEmpty() bool {
	return len(s.lines) == 0
}

func (s *OrderStore) Total() float64 {
	var total float64
	for _, line := range s.lines {
		total += line.Price * float64(line.Quantity)
	}
	return total
}

// Snapshot returns the cart's current lines in a stable, sorted order for
// deterministic client rendering and easy testing.
func (s *OrderStore) Snapshot() []orderLine {
	lines := make([]orderLine, 0, len(s.lines))
	for _, line := range s.lines {
		lines = append(lines, line)
	}
	sort.Slice(lines, func(i, j int) bool { return lines[i].ProductID < lines[j].ProductID })
	return lines
}
