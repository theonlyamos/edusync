import { describe, expect, it } from 'vitest'
import { FLASHCARD_BATCH, afterReview, cardFromQuestion, dueCards, dueLabel, parseFlashcard, parseFlashcards, type Flashcard } from '@/lib/flashcards'

const card = (over: Partial<Flashcard>): Flashcard => ({ id: 'c', subject: '', front: 'Q', back: 'A', box: 1, dueOn: '2026-11-10', reviews: 0, ...over })

describe('flashcards', () => {
  it('cleans a card and says what is missing', () => {
    expect(parseFlashcard({ front: '  What is\n 2+2? ', back: ' 4 ', subject: ' Maths ' })).toEqual({ subject: 'Maths', front: 'What is 2+2?', back: '4' })
    expect(parseFlashcard({ front: ' ', back: '4' })).toMatch(/front/)
    expect(parseFlashcard({ front: 'Q' })).toMatch(/back/)
    expect(parseFlashcard(null)).toMatch(/front/)
    const long = parseFlashcard({ front: 'x'.repeat(900), back: 'y'.repeat(2000) })
    expect(typeof long !== 'string' && [long.front.length, long.back.length]).toEqual([500, 1000])
  })

  it('takes a batch, drops repeated questions and refuses too many', () => {
    expect(parseFlashcards([{ front: 'Q', back: 'A' }, { front: 'q', back: 'B' }])).toEqual([{ subject: '', front: 'Q', back: 'A' }])
    expect(parseFlashcards([])).toMatch(/at least one/)
    expect(parseFlashcards('nope')).toMatch(/at least one/)
    expect(parseFlashcards(Array.from({ length: FLASHCARD_BATCH + 1 }, (_, i) => ({ front: `Q${i}`, back: 'A' })))).toMatch(/up to/)
    expect(parseFlashcards([{ front: 'Q', back: '' }])).toMatch(/back/)
  })

  it('moves a remembered card up with a longer wait and a missed card back to the start', () => {
    expect(afterReview(1, true, '2026-11-10')).toEqual({ box: 2, dueOn: '2026-11-12' })
    expect(afterReview(2, true, '2026-11-10')).toEqual({ box: 3, dueOn: '2026-11-14' })
    expect(afterReview(5, true, '2026-11-10')).toEqual({ box: 5, dueOn: '2026-11-26' })
    expect(afterReview(4, false, '2026-11-30')).toEqual({ box: 1, dueOn: '2026-12-01' })
    expect(afterReview(99, true, '2026-11-10').box).toBe(5)
    expect(afterReview(Number.NaN, false, '2026-11-10').box).toBe(1)
  })

  it('lists what is due, least known first', () => {
    const cards = [card({ id: 'later', dueOn: '2026-11-11' }), card({ id: 'known', box: 4, dueOn: '2026-11-09' }), card({ id: 'new', box: 1 }), card({ id: 'old', box: 1, dueOn: '2026-11-01' })]
    expect(dueCards(cards, '2026-11-10').map((c) => c.id)).toEqual(['old', 'new', 'known'])
  })

  it('says when a card comes back', () => {
    expect(dueLabel('2026-11-09', '2026-11-10')).toBe('Due now')
    expect(dueLabel('2026-11-11', '2026-11-10')).toBe('Tomorrow')
    expect(dueLabel('2026-12-02', '2026-11-28')).toBe('In 4 days')
  })

  it('turns a missed question into a card', () => {
    expect(cardFromQuestion({ question: 'Capital of Ghana?', correctAnswer: 'Accra', explanation: 'It is on the coast.' }, 'Geography')).toEqual({ subject: 'Geography', front: 'Capital of Ghana?', back: 'Accra · It is on the coast.' })
    expect(cardFromQuestion({ question: 'Pick primes', correctAnswer: ['2', '3'] }, '')?.back).toBe('2, 3')
    expect(cardFromQuestion({ question: '', correctAnswer: 'x' }, '')).toBeNull()
  })
})
