import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server.js";
import { api } from "./_generated/api.js";

const http = httpRouter();

http.route({
  path: "/comments/last",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const targetId = url.searchParams.get("targetId");
    
    if (!targetId) {
      return new Response("Missing targetId parameter", { status: 400 });
    }

    const comments = await ctx.runQuery(api.example.list, { targetId });
    const lastComment = comments && comments.length > 0 ? comments[0] : null;

    if (!lastComment) {
      return new Response(
        JSON.stringify({ message: "No comments found" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        _id: lastComment._id,
        text: lastComment.text,
        translatedText: lastComment.translatedText,
        targetId: lastComment.targetId,
        _creationTime: lastComment._creationTime,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  }),
});

export default http;
