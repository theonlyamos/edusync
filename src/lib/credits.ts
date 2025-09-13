import { createServerSupabase } from '@/lib/supabase.server'

export async function getUserCredits(userId: string): Promise<number> {
    const supabase = createServerSupabase()

    const { data, error } = await supabase
        .from('users')
        .select('credits')
        .eq('id', userId)
        .single()

    if (error || !data) return 0
    return data.credits || 0
}

export async function hasEnoughCredits(userId: string, minutes: number = 1): Promise<boolean> {
    const credits = await getUserCredits(userId)
    return credits >= minutes
}

export async function deductCreditsForMinute(
    userId: string,
    sessionId: string
): Promise<{ success: boolean; remainingCredits: number; error?: string }> {
    const supabase = createServerSupabase()

    try {
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('credits, total_credits_used')
            .eq('id', userId)
            .single()

        if (userError || !userData) {
            return { success: false, remainingCredits: 0, error: 'User not found' }
        }

        if (userData.credits < 1) {
            return {
                success: false,
                remainingCredits: userData.credits,
                error: 'Insufficient credits'
            }
        }

        const newCredits = userData.credits - 1
        const { error: updateError } = await supabase
            .from('users')
            .update({
                credits: newCredits,
                total_credits_used: (userData.total_credits_used || 0) + 1
            })
            .eq('id', userId)

        if (updateError) {
            return { success: false, remainingCredits: userData.credits, error: 'Failed to update credits' }
        }

        // Log transaction
        await supabase.from('credit_transactions').insert({
            user_id: userId,
            transaction_type: 'usage',
            credits: -1,
            description: 'Used 1 credit for 1 minute of AI session',
            session_id: sessionId
        })

        return { success: true, remainingCredits: newCredits }
    } catch (error: any) {
        return { success: false, remainingCredits: 0, error: error.message }
    }
}

export async function addCredits(
    userId: string,
    credits: number,
    description: string,
    type: 'purchase' | 'bonus' | 'refund' = 'purchase',
    paymentIntentId?: string
): Promise<{ success: boolean; newTotal: number; error?: string }> {
    const supabase = createServerSupabase()

    try {
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('credits, total_credits_purchased')
            .eq('id', userId)
            .single()

        if (userError || !userData) {
            return { success: false, newTotal: 0, error: 'User not found' }
        }

        const newTotal = userData.credits + credits
        const updateData: any = { credits: newTotal }

        if (type === 'purchase') {
            updateData.total_credits_purchased = (userData.total_credits_purchased || 0) + credits
        }

        const { error: updateError } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', userId)

        if (updateError) {
            console.error('Error updating credits:', updateError)
            return { success: false, newTotal: userData.credits, error: 'Failed to update credits' }
        }

        // Log transaction
        await supabase.from('credit_transactions').insert({
            user_id: userId,
            transaction_type: type,
            credits: credits,
            description,
            stripe_payment_intent_id: paymentIntentId
        })

        return { success: true, newTotal }
    } catch (error: any) {
        return { success: false, newTotal: 0, error: error.message }
    }
}

export async function getCreditHistory(userId: string, limit: number = 50) {
    const supabase = createServerSupabase()

    const { data, error } = await supabase
        .from('credit_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

    return { data: data || [], error }
}

export async function getCreditUsageByTopic(userId: string) {
    const supabase = createServerSupabase()

    const { data, error } = await supabase
        .from('credit_transactions')
        .select(`
            credits,
            created_at,
            learning_sessions!inner(topic)
        `)
        .eq('user_id', userId)
        .eq('transaction_type', 'usage')
        .not('learning_sessions.topic', 'is', null)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching credit usage by topic:', error)
        return { data: [], error }
    }

    // Aggregate by topic
    const aggregated = (data || []).reduce((acc: any, transaction: any) => {
        const topic = transaction.learning_sessions?.topic || 'Unknown Topic'

        if (!acc[topic]) {
            acc[topic] = {
                topic,
                totalCredits: 0,
                totalMinutes: 0,
                sessionCount: 0,
                lastUsed: transaction.created_at
            }
        }

        acc[topic].totalCredits += Math.abs(transaction.credits)
        acc[topic].totalMinutes += Math.abs(transaction.credits) // 1 credit = 1 minute
        acc[topic].sessionCount += 1

        // Keep the most recent date
        if (new Date(transaction.created_at) > new Date(acc[topic].lastUsed)) {
            acc[topic].lastUsed = transaction.created_at
        }

        return acc
    }, {})

    // Convert to array and sort by total credits used (descending)
    const aggregatedArray = Object.values(aggregated).sort((a: any, b: any) => b.totalCredits - a.totalCredits)

    return { data: aggregatedArray, error: null }
}

// Initialize new users with 60 free credits (called during signup)
export async function initializeUserCredits(userId: string) {
    const supabase = createServerSupabase()

    // Check if user already has credits initialized
    const { data: userData } = await supabase
        .from('users')
        .select('credits')
        .eq('id', userId)
        .single()

    if (userData && userData.credits >= 60) {
        return // Already initialized
    }

    await supabase
        .from('users')
        .update({ credits: 60 })
        .eq('id', userId)

    await supabase.from('credit_transactions').insert({
        user_id: userId,
        transaction_type: 'bonus',
        credits: 60,
        description: 'Welcome bonus - 60 free credits'
    })
}
