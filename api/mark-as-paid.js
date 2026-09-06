const { createClient } = require("@supabase/supabase-js")

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SECRET_KEY
)

module.exports = async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*")
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
    res.setHeader("Access-Control-Allow-Headers", "Content-Type")

    if (req.method === "OPTIONS") return res.status(200).end()
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })

    try {
        const { password, orderId } = req.body

        if (password !== process.env.ORDERS_DASHBOARD_PASSWORD) {
            return res.status(401).json({ success: false, error: "Unauthorized" })
        }

        if (!orderId) {
            return res.status(400).json({ success: false, error: "Missing orderId" })
        }

        // Look up the order first to make sure it isn't already paid
        const { data: existing, error: findError } = await supabase
            .from("orders")
            .select("id, status, order_number")
            .eq("id", orderId)
            .single()

        if (findError || !existing) {
            return res.status(404).json({ success: false, error: "Order not found" })
        }

        if (existing.status === "paid") {
            // Already paid — nothing to do, return as-is
            return res.status(200).json({ success: true, orderNumber: existing.order_number, alreadyPaid: true })
        }

        // Assign the next sequential order number, same rule as everywhere else:
        // only paid orders ever consume a number.
        const { data: maxRow } = await supabase
            .from("orders")
            .select("order_number")
            .not("order_number", "is", null)
            .order("order_number", { ascending: false })
            .limit(1)
            .maybeSingle()

        const nextNumber = (maxRow?.order_number || 0) + 1

        const { error: updateError } = await supabase
            .from("orders")
            .update({ status: "paid", order_number: nextNumber, paid_at: new Date().toISOString() })
            .eq("id", orderId)

        if (updateError) {
            console.error("Mark as paid error:", updateError)
            return res.status(500).json({ success: false, error: "Failed to update order" })
        }

        res.status(200).json({ success: true, orderNumber: nextNumber, alreadyPaid: false })

    } catch (error) {
        console.error("Mark as paid error:", error)
        res.status(500).json({ success: false, error: "Failed to update order" })
    }
}
