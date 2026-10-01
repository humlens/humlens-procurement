// A received line's `condition` is free text. Empty, or a word meaning it
// arrived fine, is good; anything else ("damaged", "wrong item", "2 broken")
// is not, and those units aren't added to stock or counted as delivered well.
// The store applies the same rule to receipts it forwards (see CONTRACT.md).
export const GOOD_CONDITION = /^(good|ok|okay|fine|accepted|intact)?$/i;

export const isGoodCondition = (condition: string | null | undefined) => GOOD_CONDITION.test(condition?.trim() ?? '');
