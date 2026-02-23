export function calculateLoyalty(amount) {
    if (amount >= 5000) {
        return { tier: "Gold", discount: 500, message: "Gold Tier discount applied (₹500 off)!" };
    } else if (amount >= 2000) {
        return { tier: "Silver", discount: 200, message: "Silver Tier discount applied (₹200 off)!" };
    } else {
        return { tier: "Bronze", discount: 0, message: "Enjoy free delivery on this item!" };
    }
}