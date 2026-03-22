targetScope = 'resourceGroup'

@description('Resource prefix used for generated names.')
param prefix string = 'articlepod'

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Azure region for Azure OpenAI resources.')
param openAiLocation string = 'eastus'

@description('Linux VM size for web/worker/python-tts runtime.')
param vmSize string = 'Standard_B2s'

@description('Admin username for VM SSH login.')
param adminUsername string = 'azureuser'

@description('SSH public key for VM access.')
param adminPublicKey string

@description('PostgreSQL Flexible Server admin login.')
param postgresAdminLogin string = 'articlepod_admin'

@secure()
@description('PostgreSQL Flexible Server admin password.')
param postgresAdminPassword string

@description('PostgreSQL compute SKU.')
param postgresSkuName string = 'Standard_D2ds_v4'

@description('PostgreSQL storage size in GiB.')
param postgresStorageSizeGb int = 128

var storageAccountName = toLower(replace('${prefix}${uniqueString(resourceGroup().id)}', '-', ''))
var vnetName = '${prefix}-vnet'
var subnetName = '${prefix}-app-subnet'
var nsgName = '${prefix}-nsg'
var publicIpName = '${prefix}-pip'
var nicName = '${prefix}-nic'
var vmName = '${prefix}-vm'
var postgresServerName = '${prefix}-pg-${uniqueString(resourceGroup().id)}'
var openAiAccountName = take(toLower(replace('${prefix}aoai${uniqueString(subscription().subscriptionId, resourceGroup().id)}', '-', '')), 64)
var blobContainerName = 'articlepod'
var databaseName = 'articlepod'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  name: '${storage.name}/default'
}

resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  name: '${storage.name}/default/${blobContainerName}'
  properties: {
    publicAccess: 'None'
  }
}

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: postgresServerName
  location: location
  sku: {
    name: postgresSkuName
    tier: 'GeneralPurpose'
  }
  properties: {
    administratorLogin: postgresAdminLogin
    administratorLoginPassword: postgresAdminPassword
    version: '16'
    storage: {
      storageSizeGB: postgresStorageSizeGb
    }
    backup: {
      backupRetentionDays: 14
      geoRedundantBackup: 'Enabled'
    }
    network: {
      publicNetworkAccess: 'Enabled'
    }
    availabilityZone: '1'
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  name: '${postgres.name}/${databaseName}'
  properties: {
    charset: 'UTF8'
    collation: 'en_US.utf8'
  }
}

resource openAi 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: openAiAccountName
  location: openAiLocation
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: openAiAccountName
    publicNetworkAccess: 'Enabled'
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2023-04-01' = {
  name: vnetName
  location: location
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.40.0.0/16'
      ]
    }
    subnets: [
      {
        name: subnetName
        properties: {
          addressPrefix: '10.40.1.0/24'
        }
      }
    ]
  }
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2023-04-01' = {
  name: nsgName
  location: location
  properties: {
    securityRules: [
      {
        name: 'allow-ssh'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '22'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 100
          direction: 'Inbound'
        }
      }
      {
        name: 'allow-http'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '80'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 110
          direction: 'Inbound'
        }
      }
      {
        name: 'allow-https'
        properties: {
          protocol: 'Tcp'
          sourcePortRange: '*'
          destinationPortRange: '443'
          sourceAddressPrefix: '*'
          destinationAddressPrefix: '*'
          access: 'Allow'
          priority: 120
          direction: 'Inbound'
        }
      }
    ]
  }
}

resource publicIp 'Microsoft.Network/publicIPAddresses@2023-04-01' = {
  name: publicIpName
  location: location
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAddressVersion: 'IPv4'
    publicIPAllocationMethod: 'Static'
    dnsSettings: {
      domainNameLabel: '${prefix}-${uniqueString(resourceGroup().id)}'
    }
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2023-04-01' = {
  name: nicName
  location: location
  properties: {
    networkSecurityGroup: {
      id: nsg.id
    }
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: {
          privateIPAllocationMethod: 'Dynamic'
          subnet: {
            id: vnet.properties.subnets[0].id
          }
          publicIPAddress: {
            id: publicIp.id
          }
        }
      }
    ]
  }
}

resource vm 'Microsoft.Compute/virtualMachines@2023-09-01' = {
  name: vmName
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    osProfile: {
      computerName: vmName
      adminUsername: adminUsername
      linuxConfiguration: {
        disablePasswordAuthentication: true
        ssh: {
          publicKeys: [
            {
              path: '/home/${adminUsername}/.ssh/authorized_keys'
              keyData: adminPublicKey
            }
          ]
        }
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'Canonical'
        offer: '0001-com-ubuntu-server-jammy'
        sku: '22_04-lts-gen2'
        version: 'latest'
      }
      osDisk: {
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: 'Premium_LRS'
        }
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic.id
        }
      ]
    }
  }
}

resource blobDataContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storage.id, vm.id, 'storage-blob-data-contributor')
  scope: storage
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'ba92f5b4-2d11-453d-a403-e96b0029c9fe')
    principalId: vm.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

output vmName string = vm.name
output vmPublicIp string = publicIp.properties.ipAddress
output vmFqdn string = publicIp.properties.dnsSettings.fqdn
output storageAccount string = storage.name
output storageContainer string = blobContainerName
output storageBlobEndpoint string = 'https://${storage.name}.blob.core.windows.net'
output postgresServer string = postgres.name
output postgresDatabase string = postgresDb.name
output postgresHost string = '${postgres.name}.postgres.database.azure.com'
output postgresAdminUser string = '${postgresAdminLogin}'
output recommendedDatabaseUrl string = 'postgresql://${postgresAdminLogin}:${'<password>'}@${postgres.name}.postgres.database.azure.com:5432/${databaseName}?sslmode=require'
output openAiAccountName string = openAi.name
output openAiEndpoint string = 'https://${openAi.name}.openai.azure.com'
output openAiLocation string = openAiLocation
