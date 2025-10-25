import { db } from "./db/index.js";
import { todosTable } from "./db/schema.js";
import { ilike, eq } from "drizzle-orm";
import readlineSync from "readline-sync";
import { OpenAI } from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Tools
async function getAllTodods() {
  const todos = await db.select().from(todosTable);
  return todos;
}

async function createTodo(todo) {
 const [res] = await db.insert(todosTable).values({ todo }).returning({
    id: todosTable.id,
  });
  return res.id;
}

async function searchTodos(search) {
  const todos = await db.select().from(todosTable).where(ilike(todosTable.todo, `%${search}%`));
  return todos;
}

async function deleteTodo(id) {
  await db.delete(todosTable).where(eq(todosTable.id, id));
}

const tools = {
    getAllTodods: getAllTodods,
    createTodo: createTodo,
    searchTodos: searchTodos,
    deleteTodo: deleteTodo,
}

const SYSTEM_PROMPT =  `You are an AI Todo Assistant with START, PLAN, ACTION, OBSERVATION and OUTPUT State.
Wait for the use prompt and first PLAN using available tools.
Afet planning, take the ACTION with appropriate tools and wait for OBSERVATION based on ACTION.
Once you have the OBSERVATION, return the AI response based on START prompt and OBSERVATION.

You can manage tasks by adding, viewing, updating, and deleting them based on user commands.
You must strictly follow the JSON output format.

Todo DB Schema:
id: integer, primary key
todo: string, not null
created_at: timestamp, default current timestamp
updated_at: timestamp, auto-updated on modification

Available Tools:
1. getAllTodods: Retrieves all to-do items.
   - Input: None
   - Output: JSON array of to-do items. 
2. createTodo: Adds a new to-do item.
   - Input: A string representing the to-do item.
   - Output: The ID of the newly created to-do item in JSON.
3. searchTodos: Searches for to-do items containing a specific keyword.
   - Input: A string keyword to search for.
   - Output: JSON array of matching to-do items.
4. deleteTodo: Deletes a to-do item by its ID.
   - Input: The ID of the to-do item to delete.
   - Output: Confirmation message in JSON.

Example Interaction:
START
{"type": "user", "user": "Add a new task to buy groceries."}
{"type": "plan", "plan": "I will try to get more context on what user needs to shop."}
{"type": "output", "output": "Can you tell me what all items you want to shop for?"}
{"type": "user", "user": "I want to shop for milk, bread, and vegetables."}
{"type": "plan", "plan": "I will use the createTodo tool to add the task."}
{"type": "action", "function": "createTodo","input": "Shop for milk, bread, and vegetables."}
{"type": "observation", "observation": "2"}
{"type": "output", "output": "Your todo has been added successfully with ID 2."}
`;

const messages = [
    { role: "system", content: SYSTEM_PROMPT },
];

while (true) {
  const query = readlineSync.question(">> ");
  const q = { type: "user", user: query };
  messages.push({ role: "user", content: JSON.stringify(q) });

  while (true) {
    const chat = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: messages,
      response_format: { type: "json_object" },
    });

    const result = chat.choices[0].message.content;
    console.log("AI:", result);
    messages.push({ role: "assistant", content: result });

    const call = JSON.parse(result);
    if (call.type == "output") {
      console.log(`AI Output: ${call.output}`);
      break;
    } else if (call.type == "action") {
      const fn = tools[call.function];
      if(!fn) throw new Error("Invalid Tool call");
      const observation = await fn(call.input);
      const obs_message = { type: "observation", bservation: observation };
      messages.push({
        role: "developer",
        content: JSON.stringify(obs_message),
      });
    }
  }
}