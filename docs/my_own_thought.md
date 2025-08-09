# My Own Reflections: How I Approached This Project

I carefully read and prioritized the given requirements. Although I was given 8 hours, I was able to complete the work much faster thanks to modern technology and AI tools. Next, I considered how to further improve the system. At this stage, I leveraged AI tools again to explore different scenarios.
I used AI not only to "write code faster," but also to take a step back from the classic developer perspective and think more systemically. This meant designing end-to-end flows and approaching error scenarios with a broader view.
I ran the system multiple times and tested the flows. I did not encounter any issues in critical areas such as queue definitions, retry/DLQ, idempotency, and basic health checks.

## Tools I Used:

- JetBrains Junie
- JetBrains AI Assistant Chat

## Summary of My Approach:

- I broke down the requirements into items and prioritized them (messaging was limited to MQ; core event flows were defined; retry/DLQ was specified; idempotency was defined; and readiness/liveness was defined).
- I defined service boundaries and event flows, specifying producer/consumer behavior for each flow.
- I determined event schemas (v1) and added runtime validation at production and consumption points to prevent invalid payloads from entering the system.
- I implemented retry/DLQ logic and idempotent record strategies for resilience.
- I used Docker Compose to quickly spin up and tear down the environment for development and demonstration purposes.

## Verification and checks:

- Monitored health status through service readiness/liveness endpoints.
- Key end-to-end flows (e.g., order creation/cancellation, inventory approval/rejection, and notification) were tested via both HTTP and helper scripts (e.g., scripts/mq-publish.sh).
- I monitored queues and message states through the RabbitMQ UI to verify retry and DLQ behavior.

If the goal is to evaluate my software development skills, I would be happy to complete the task independently within a day and deliver it to you. This would allow me to provide a detailed explanation of the process and my technical choices.

I wrote these notes to add transparency to the evaluation process. I don't just view AI tools as a way to produce results faster; I also see them as assistants that enhance systematic thinking, design quality, and the ability to address error scenarios with a wider perspective. If needed, I can also apply the same solution manually.