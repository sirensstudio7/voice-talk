with open("apps/customer-app/src/features/commerce/BasketDrawer.tsx", "r") as f:
    content = f.read()

content = content.replace("""  const {
    order,
    checkoutPhase,
    checkoutPanelOpen,
    confirmManualCheckout,
    markPaid,
    expirePayment,
    startNewOrder,
    closeCheckoutPanel,
    openMenuPanel,
    addItemToOrder,
    decrementItemFromOrder,
    removeItemFromOrder,
    setItemNote,
  } = useVoiceStore();""",
"""  const {
    order,
    checkoutPhase,
    confirmManualCheckout,
    markPaid,
    expirePayment,
    startNewOrder,
    addItemToOrder,
    decrementItemFromOrder,
    removeItemFromOrder,
    setItemNote,
  } = useCommerceStore();
  const { checkoutPanelOpen, closeCheckoutPanel, openMenuPanel } = useUiStore();""")

with open("apps/customer-app/src/features/commerce/BasketDrawer.tsx", "w") as f:
    f.write(content)
