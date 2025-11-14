# issue-2025-09-14

Status: Not yet resolved

## How to reproduce

1. The user sends a message to "deploy a nginx server"
2. ui receives the message

````json
{
  "infrastructure": [
    {
      "type": "text",
      "text": "❌ Ready to deploy undefined with the following configuration:\n\n📋 **Deployment Settings:**\n• Name: undefined\n• Image: undefined\n• Namespace: default\n• Replicas: 1\n• Port: 80\n• CPU: 100m\n• Memory: 128Mi\n\n📄 **Kubernetes Manifest Preview:**\n```yaml\napiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: undefined\n  namespace: default\n  labels:\n    app: undefined\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: undefined\n  template:\n    metadata:\n      labels:\n        app: undefined\n    spec:\n      containers:\n      - name: undefined\n        image: undefined\n        ports:\n        - containerPort: 80\n        resources:\n          requests:\n            cpu: 100m\n            memory: 128Mi\n---\napiVersion: v1\nkind: Service\nmetadata:\n  name: undefined\n  namespace: default\nspec:\n  selector:\n    app: undefined\n  ports:\n  - port: 80\n    targetPort: 80\n  type: ClusterIP\n```\n\nThis will create a Deployment and Service in your Kubernetes cluster.",
      "annotations": {
        "audience": ["user", "assistant"],
        "priority": 0.9,
        "executionTime": 0
      }
    }
  ],
  "_summary": {
    "totalAgents": 1,
    "successfulAgents": 1,
    "totalExecutionTime": 0,
    "agents": [
      {
        "agentId": "infrastructure",
        "action": "deployApplication",
        "success": true,
        "executionTime": 0
      }
    ]
  }
}
````

## Actuals

1. kubectl get all -> return no nginx server deployed
2. UI shows
   > Operation Summary Request: deploy nginx server Primary Agent: 🔧
   > Infrastructure Agent Action: deployApplication
   >
   > Agent Results 🔧 Infrastructure Agent ✅ Action: deployApplication Result:
   > Operation completed successfully Execution Time: 0ms
   >
   > Next Steps • Check deployment status in Kubernetes dashboard • Monitor
   > resource utilization and scaling • Verify service endpoints are accessible

## Expectations

- Meta-Agent should ask for the name to be used for nginx service/deployment/app
- Meta-Agent should respond with the final manifest and ask for approval before
  executing
- User should provide approval in UI
- On approval, Meta Agent should send the request infrastructure agent without
  sending to LLM as its a straight forward action.

## RCA
