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

        const { error: deleteError } = await supabase
            .from("orders")
            .delete()
            .eq("id", orderId)

        if (deleteError) {
            console.error("Delete order error:", deleteError)
            return res.status(500).json({ success: false, error: "Failed to delete order" })
        }

        res.status(200).json({ success: true })

    } catch (error) {
        console.error("Delete order error:", error)
        res.status(500).json({ success: false, error: "Failed to delete order" })
    }
}
