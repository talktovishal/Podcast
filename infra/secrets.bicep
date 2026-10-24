targetScope = 'resourceGroup'

@description('Globally unique vault name for this existing deployment.')
@minLength(3)
@maxLength(24)
param vaultName string

param location string = resourceGroup().location

@description('Object ID of the existing VM system-assigned managed identity.')
@minLength(36)
@maxLength(36)
param runtimePrincipalId string

@description('Verified public IPv4 addresses/CIDRs for VM egress and authorized secret administration.')
@minLength(1)
param allowedIpv4Cidrs array

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'None'
      defaultAction: 'Deny'
      ipRules: [for cidr in allowedIpv4Cidrs: {
        value: cidr
      }]
    }
  }
}

resource runtimeSecretsReader 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(vault.id, runtimePrincipalId, 'runtime-secrets-reader')
  scope: vault
  properties: {
    principalId: runtimePrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

output vaultUri string = vault.properties.vaultUri
output vaultResourceId string = vault.id
