import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  comments: defineTable({
    text: v.string(),
    targetId: v.string(),
    translatedText: v.optional(v.string()),
  }).index("by_targetId", ["targetId"]),
});
