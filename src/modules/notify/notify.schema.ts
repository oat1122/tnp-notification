import { FastifySchema } from "fastify";

export const notifySchema: FastifySchema = {
  body: {
    type: "object",
    required: ["user_id", "title", "message"],
    additionalProperties: false,
    properties: {
      user_id: { type: "string", minLength: 1, maxLength: 50 },
      title: { type: "string", minLength: 1, maxLength: 200 },
      message: { type: "string", minLength: 1, maxLength: 2000 },
      type: {
        type: "string",
        enum: ["info", "success", "warning", "error"],
      },
    },
  },
};

export const syncSchema: FastifySchema = {
  body: {
    type: "object",
    required: ["user_id", "unread_count"],
    additionalProperties: false,
    properties: {
      user_id: { type: "string", minLength: 1, maxLength: 50 },
      unread_count: { type: "integer", minimum: 0 },
    },
  },
};
