import * as aws from "@pulumi/aws";
import * as eks from "@pulumi/eks";
import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";

const name = "cluster";
const cluster = new eks.Cluster(name, {
  createOidcProvider: true,
  userMappings: [
    {
      userArn: "arn:aws:iam::717012417639:user/abatilo",
      username: "kube_admin:abatilo",
      groups: ["system:masters"]
    }
  ]
});

const provider = new k8s.Provider(name, {
  kubeconfig: cluster.kubeconfig.apply(JSON.stringify)
});

const clusterOidcProvider = cluster.core.oidcProvider;
const clusterOidcProviderUrl = clusterOidcProvider?.url;

const externalDNSAssumePolicy = pulumi
  .all([clusterOidcProviderUrl, clusterOidcProvider?.arn])
  .apply(([url, arn]) =>
    aws.iam.getPolicyDocument({
      statements: [
        {
          actions: ["sts:AssumeRoleWithWebIdentity"],
          conditions: [
            {
              test: "StringEquals",
              values: [`system:serviceaccount:kube-system:external-dns`],
              variable: `${url.replace("https://", "")}:sub`
            }
          ],
          effect: "Allow",
          principals: [{ identifiers: [arn], type: "Federated" }]
        }
      ]
    })
  );

const externalDNSRole = new aws.iam.Role("external-dns", {
  assumeRolePolicy: externalDNSAssumePolicy.json
});

const externalDNSPolicy = new aws.iam.Policy("external-dns", {
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: ["route53:ChangeResourceRecordSets"],
        Resource: ["arn:aws:route53:::hostedzone/*"]
      },
      {
        Effect: "Allow",
        Action: ["route53:ListHostedZones", "route53:ListResourceRecordSets"],
        Resource: ["*"]
      }
    ]
  })
});

const externalDNSAttachment = new aws.iam.RolePolicyAttachment("external-dns", {
  role: externalDNSRole,
  policyArn: externalDNSPolicy.arn
});

const certManagerAssumePolicy = pulumi
  .all([clusterOidcProviderUrl, clusterOidcProvider?.arn])
  .apply(([url, arn]) =>
    aws.iam.getPolicyDocument({
      statements: [
        {
          actions: ["sts:AssumeRoleWithWebIdentity"],
          conditions: [
            {
              test: "StringEquals",
              values: [`system:serviceaccount:cert-manager:cert-manager`],
              variable: `${url.replace("https://", "")}:sub`
            }
          ],
          effect: "Allow",
          principals: [{ identifiers: [arn], type: "Federated" }]
        }
      ]
    })
  );

const certManagerRole = new aws.iam.Role("cert-manager", {
  assumeRolePolicy: certManagerAssumePolicy.json
});

const certManagerPolicy = new aws.iam.Policy("cert-manager", {
  policy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "route53:GetChange",
        Resource: "arn:aws:route53:::change/*"
      },
      {
        Effect: "Allow",
        Action: [
          "route53:ChangeResourceRecordSets",
          "route53:ListResourceRecordSets"
        ],
        Resource: "arn:aws:route53:::hostedzone/*"
      },
      {
        Effect: "Allow",
        Action: "route53:ListHostedZonesByName",
        Resource: "*"
      }
    ]
  })
});

const certManagerAttachment = new aws.iam.RolePolicyAttachment("cert-manager", {
  role: certManagerRole,
  policyArn: certManagerPolicy.arn
});

// Export the cluster's kubeconfig.
export const kubeconfig = cluster.kubeconfig;
