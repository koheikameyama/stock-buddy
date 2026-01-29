/**
 * Generate Daily Coach Messages
 *
 * This script generates personalized daily messages for all users.
 * Should be run daily as a cron job.
 *
 * Usage:
 *   tsx scripts/generate-coach-messages.ts
 */

async function generateCoachMessages() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const response = await fetch(`${baseUrl}/api/coach-messages/generate`, {
      method: "POST",
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()
    console.log("✅ Coach messages generated successfully")
    console.log(`Generated ${result.generatedCount} messages`)
  } catch (error) {
    console.error("❌ Error generating coach messages:", error)
    process.exit(1)
  }
}

generateCoachMessages()
