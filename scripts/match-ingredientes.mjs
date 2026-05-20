import { writeFileSync } from 'fs'

const productos = [
  {id:'45effe81-255e-4f1e-9f37-c6335484e612',nombre:'Aceite barbieri',precio:2308.88,unidad:'l'},
  {id:'af37fe51-7092-4e45-9cd3-fa8562db3e1a',nombre:'Aceite de sesamo',precio:16323,unidad:'l'},
  {id:'f53d8b4c-8622-4987-b485-a3ef2aff4b85',nombre:'Aceitunas',precio:8028.33,unidad:'kg'},
  {id:'d3164a31-d0b2-4d68-b99e-98a44a15fda9',nombre:'Acido ascorbico',precio:10154.8,unidad:'kg'},
  {id:'e4ba509a-c94b-4c89-b1d5-c6886c2992cc',nombre:'Acido citrico',precio:2608.25,unidad:'kg'},
  {id:'210c0143-ce66-44a4-b113-ec2f3ca75dff',nombre:'Agar agar',precio:44628,unidad:'kg'},
  {id:'600ca3ea-d5fb-4d82-9bba-2a30b42681a2',nombre:'Aji molido',precio:7438.02,unidad:'kg'},
  {id:'e5533e2b-ae00-499b-b016-c9892601ec3e',nombre:'Aji panca',precio:13966.94,unidad:'kg'},
  {id:'be59f75e-4be9-4d44-946b-b0d7fff6e9ff',nombre:'Ajo',precio:9600,unidad:'kg'},
  {id:'0531ef24-a8ab-41a4-a89a-97cc89924bd7',nombre:'Ajo en polvo',precio:7438.02,unidad:'kg'},
  {id:'a31166a2-2041-4ec0-b879-70fb466e2078',nombre:'Ajo negro',precio:32640,unidad:'kg'},
  {id:'24b05999-3ad0-4bd0-a14f-723e695dd8fa',nombre:'Albahaca',precio:1760,unidad:'unidad'},
  {id:'48f9aab5-094c-4786-b47c-0df2ac103b53',nombre:'Alcaparras en frasco',precio:18845.05,unidad:'unidad'},
  {id:'2bfe6b79-b155-45a7-9221-85ba95d6029d',nombre:'Alcauciles',precio:900,unidad:'unidad'},
  {id:'bd4db459-9c40-44d8-8eac-0131e73248ed',nombre:'Almidon de maiz',precio:2900.83,unidad:'kg'},
  {id:'ea9c8dc3-6226-436f-89a8-a29950849415',nombre:'Anchoas en sal',precio:21769.91,unidad:'kg'},
  {id:'071d62ef-feb2-49c4-937b-9901db84b9e1',nombre:'Anis estrellado',precio:25182.47,unidad:'kg'},
  {id:'e876a911-2c4c-4dda-bcd9-3f3ddb67b223',nombre:'Apio',precio:5006.15,unidad:'kg'},
  {id:'356caf32-0ddc-42c0-a39c-be82311a4ee3',nombre:'Arroz basmati',precio:4958.68,unidad:'kg'},
  {id:'06b0756b-4602-456a-b252-3e824ada109c',nombre:'Arroz perso paquete',precio:1109.73,unidad:'kg'},
  {id:'0ee8bea5-c8a4-4686-8f4f-c7aa995b1b37',nombre:'Arveja',precio:4500,unidad:'kg'},
  {id:'d3529439-9572-4c76-8b33-6e8c0f752c61',nombre:'Azucar',precio:988.43,unidad:'kg'},
  {id:'644ec160-449d-4fae-b791-668ee207f5ea',nombre:'Azucar impalpable',precio:2380.16,unidad:'kg'},
  {id:'f1347b68-e27e-4758-bc09-8d3c584a40c5',nombre:'Azucar mascabo',precio:2677.69,unidad:'kg'},
  {id:'79d22617-670e-4068-ac2d-f52e46e0a3ad',nombre:'Batata',precio:3600,unidad:'kg'},
  {id:'120f8883-e356-4aaf-9099-05a22ae4029e',nombre:'Berenjena',precio:1871.8,unidad:'kg'},
  {id:'31e7876f-145e-45e6-aab5-7d90866e7c2d',nombre:'Berro',precio:1500,unidad:'unidad'},
  {id:'10b8a18a-b3c8-4aae-805e-e620ad88bcd5',nombre:'Berro hidroponico',precio:1500,unidad:'unidad'},
  {id:'6885d3f6-5c47-4b05-88b8-4215c4a60d03',nombre:'Bicarbonato',precio:2938.02,unidad:'kg'},
  {id:'843a0d28-3d3e-4440-b09e-ccf6585b0f9b',nombre:'Bife de chorizo',precio:18152.34,unidad:'kg'},
  {id:'8d51f19e-6487-4879-90b6-8c0951e98e2b',nombre:'Brocoli',precio:3825,unidad:'kg'},
  {id:'8a00298d-f2ea-405d-9895-b175173250ad',nombre:'Cacao amargo',precio:13884.3,unidad:'kg'},
  {id:'9a28971a-2fa8-42a9-9091-17c0a377e828',nombre:'Calabacin',precio:1036.11,unidad:'kg'},
  {id:'174de5a5-7860-400d-8316-519753445d38',nombre:'Canela polvo',precio:12396.69,unidad:'kg'},
  {id:'dfcfaad6-5d64-430d-98cd-a18cd25bb675',nombre:'Canela rama',precio:28925.62,unidad:'kg'},
  {id:'c6290c19-650a-4a8d-945a-790f9c182c52',nombre:'Cardamomo',precio:42148.67,unidad:'kg'},
  {id:'b3ac818e-b271-4815-9d28-cd4f375a2caa',nombre:'Castanas',precio:16809.92,unidad:'kg'},
  {id:'7a296474-220f-48f6-8b38-c4915d628f45',nombre:'Cayena',precio:9090.91,unidad:'kg'},
  {id:'75464970-2461-4b68-aba9-bf7217b6a5bc',nombre:'Cebolla en escamas',precio:7933.87,unidad:'kg'},
  {id:'092d2790-f099-49b2-99db-294b820c18f6',nombre:'Cebolla morada',precio:1623.5,unidad:'kg'},
  {id:'19121e76-0ccd-472b-9856-823e3b9ec6a2',nombre:'Chaucha',precio:5151,unidad:'kg'},
  {id:'200eca81-1712-45e3-9289-d9a9df9b08ff',nombre:'Chocolate blanco',precio:20631.32,unidad:'kg'},
  {id:'807139a0-ae75-4045-8962-d68efeac4827',nombre:'Chocolate negro',precio:21435.44,unidad:'kg'},
  {id:'452d2ee6-3f6e-482d-b24c-a3c2ca4fe0c6',nombre:'Cilantro',precio:11000,unidad:'kg'},
  {id:'4d7ff328-cc79-4dfd-8643-238d0cc66da5',nombre:'Ciruela',precio:10000,unidad:'kg'},
  {id:'6f3d6252-e874-4d93-bae0-188c268ada08',nombre:'Clavo de olor',precio:32026.4,unidad:'kg'},
  {id:'0b0d63db-21c0-4bd8-8bec-899716f051fc',nombre:'Coco rallado',precio:5850.29,unidad:'kg'},
  {id:'19e55222-a77c-4d56-9ff2-119036dfe806',nombre:'Comino en polvo',precio:11570.25,unidad:'kg'},
  {id:'035a7fb0-9c84-42db-8abf-ea7a3a7a9cc8',nombre:'Comino en semilla',precio:10901.25,unidad:'kg'},
  {id:'923752dc-cf9f-4fcb-8e6d-58a336f47a2c',nombre:'Crema tacho',precio:8650.53,unidad:'l'},
  {id:'e1b0b716-d941-416c-8c3c-24f171ea4c8c',nombre:'Curcuma',precio:9917.36,unidad:'kg'},
  {id:'71248148-e3fd-409d-90a9-27ad28f7a16b',nombre:'Datiles',precio:8330.58,unidad:'kg'},
  {id:'c3d5f438-693b-4495-9161-606d996b235a',nombre:'Dulce de leche',precio:5193.37,unidad:'unidad'},
  {id:'ebc464e8-029d-4982-843d-c4e44c051b19',nombre:'Durazno',precio:4675,unidad:'kg'},
  {id:'39a3353c-cbeb-46bf-be47-2080426fa896',nombre:'Enebro',precio:8842.23,unidad:'kg'},
  {id:'cc6b1ed8-ece9-4dbf-8b8f-5ca28bb38f5c',nombre:'Esparragos',precio:5000,unidad:'unidad'},
  {id:'81099105-5187-450a-b364-f69380988116',nombre:'Espinaca',precio:2125,unidad:'unidad'},
  {id:'fb8104f6-ddf0-48fb-b766-4a09002df20c',nombre:'Fecula de mandioca',precio:2231.4,unidad:'kg'},
  {id:'493b8271-0ab1-42e7-aaac-79b3f563647f',nombre:'Fecula de papa',precio:3272.72,unidad:'kg'},
  {id:'2d25c0d3-2caf-4ce3-940d-a6e5a38b9917',nombre:'Fenogreco en grano',precio:4760.6,unidad:'kg'},
  {id:'1a1880f0-031e-422d-bc81-0c172525e34d',nombre:'Frutillas',precio:17000,unidad:'kg'},
  {id:'88e16cee-6df0-4aed-88c3-bf8c514e6d43',nombre:'Gelatina sin sabor',precio:33471.05,unidad:'kg'},
  {id:'b85a802f-ea0d-4718-a149-fd704ec34a7c',nombre:'Glucosa',precio:3585.4,unidad:'kg'},
  {id:'7b46b7b2-aadf-4a61-adf3-2cbd56dd864f',nombre:'Goma xantica',precio:18743.8,unidad:'kg'},
  {id:'2ff12da6-5b1d-4c51-aef7-12a7c7ccd568',nombre:'Grasa cerdo',precio:5273.06,unidad:'kg'},
  {id:'46e36a51-be0a-4148-aa0d-3630c77a94ac',nombre:'Grasa vacuna',precio:2685.95,unidad:'kg'},
  {id:'90d46e6b-597f-429a-a495-138bcab2ba03',nombre:'Harina 000 panadera',precio:830.12,unidad:'kg'},
  {id:'63f95533-1f9c-499a-b158-33f88f04a488',nombre:'Harina 0000',precio:1283.24,unidad:'kg'},
  {id:'b6f3d3ce-856f-45c5-8742-ceba7c1c3b30',nombre:'Harina de almendra',precio:28264.46,unidad:'unidad'},
  {id:'1ebb8fed-dfc1-4333-99d7-68a60338ab73',nombre:'Harina de arepas',precio:2380.16,unidad:'kg'},
  {id:'095fdccb-0df2-4454-91cb-2e91e5a25dcb',nombre:'Harina de arroz glutinoso',precio:1636.36,unidad:'unidad'},
  {id:'2434e342-6462-4e9d-bf8e-777e5d5b3160',nombre:'Harina de maiz',precio:4760.34,unidad:'kg'},
  {id:'d489fa82-e4b1-4d89-9ce3-a3824c0dc72b',nombre:'Hibiscus',precio:23801.64,unidad:'kg'},
  {id:'094409f1-96c3-482d-a5dd-3d4d5b216be5',nombre:'Hinojo',precio:3400,unidad:'kg'},
  {id:'402481a9-9bf2-4dff-bcb6-897a902336a9',nombre:'Huevos',precio:217.63,unidad:'unidad'},
  {id:'97daa22b-f390-47ba-abd8-3b2c60d8f4d6',nombre:'Jalapeno',precio:5000,unidad:'kg'},
  {id:'fed95350-c85d-4708-8098-e22d464b49a3',nombre:'Jengibre',precio:7650,unidad:'kg'},
  {id:'ad7794a3-b25e-4777-83d0-d04bfa7c70d1',nombre:'Kale',precio:1500,unidad:'kg'},
  {id:'fe1c8cc7-0502-4b29-af74-36b025a7c235',nombre:'Laurel',precio:18595,unidad:'kg'},
  {id:'ac5b8da1-812e-44cf-ba13-973d2e925fe6',nombre:'Leche entera tetrabrick',precio:1764.72,unidad:'l'},
  {id:'5c2bd390-3364-49b2-8feb-b5d417ed340f',nombre:'Lenteja',precio:2450.16,unidad:'kg'},
  {id:'b72cba07-6965-45a1-9840-e6d1b123863b',nombre:'Lenteja turca',precio:3037.4,unidad:'kg'},
  {id:'8a518fa7-2f0c-4c1b-af2e-c7fe17680163',nombre:'Levadura fresca Calsa',precio:9464,unidad:'kg'},
  {id:'fbe93e82-e4c5-4ba7-a235-f64419338695',nombre:'Lima',precio:2355.37,unidad:'kg'},
  {id:'24eb9726-bcc8-4415-96b1-a54a7eb30920',nombre:'Limon',precio:1753.83,unidad:'kg'},
  {id:'a740d205-c278-4dde-a597-4f12221420aa',nombre:'Lino',precio:9917.36,unidad:'kg'},
  {id:'19f914e8-7b2b-4acb-bd6d-79b6eea78455',nombre:'Mandarina',precio:1000,unidad:'kg'},
  {id:'fbe1bbc3-c44d-4ab2-ac7e-563ce345b72b',nombre:'Mango',precio:4000,unidad:'kg'},
  {id:'e8cbaea1-41b5-4ee1-9183-23c59eb15232',nombre:'Mani pelado tostado sin sal',precio:3867.77,unidad:'kg'},
  {id:'5ac34559-d3bd-41ef-9934-8eaa15e0bfa0',nombre:'Manzana roja',precio:3336,unidad:'kg'},
  {id:'c99efeaf-8aa5-4384-879f-5cc706fe393d',nombre:'Manzana verde',precio:4000,unidad:'unidad'},
  {id:'b11b0cbc-2aee-4b7c-9d73-151575be0c71',nombre:'Membrillo',precio:2800,unidad:'kg'},
  {id:'7fde13ec-ea6c-4991-a8a1-6aa780f34799',nombre:'Menta',precio:5743.8,unidad:'kg'},
  {id:'4a28b758-2be9-4c83-bdeb-ba07cabf9c21',nombre:'Miel',precio:2409.92,unidad:'kg'},
  {id:'c79874ab-5a5b-4fc4-b0e6-6f11fef739c7',nombre:'Miso',precio:7866.62,unidad:'unidad'},
  {id:'a9c9b0d9-f6ad-4922-a513-0f66428f86ca',nombre:'Morcilla vasca',precio:15919.52,unidad:'kg'},
  {id:'1616c7bf-7047-4628-b5c8-cefe73041479',nombre:'Mostaza amarilla',precio:4304.38,unidad:'kg'},
  {id:'b883ee7d-5870-4a3c-b4ae-a6bc32ba9b97',nombre:'Mostaza negra',precio:10416,unidad:'kg'},
  {id:'2be640b8-8f96-4733-bda9-d889aeec4384',nombre:'Naranja',precio:1918.57,unidad:'kg'},
  {id:'b7ce4aa7-b6d6-429a-b4c3-5996566976f0',nombre:'Nueces de pecan',precio:21074.37,unidad:'kg'},
  {id:'32eeb180-fb3e-4cf8-a5ce-44bb2d9a864f',nombre:'Nuez moscada',precio:104132,unidad:'kg'},
  {id:'7bae122f-7da1-4496-9c95-869eb50c3c1d',nombre:'Oregano',precio:5100,unidad:'kg'},
  {id:'97eb5815-96f9-4051-889b-f4ead56e6084',nombre:'Pacu',precio:15756.65,unidad:'kg'},
  {id:'3c000592-ce4f-4c9d-b9e6-c6bbd84e8875',nombre:'Pan rallado',precio:147.16,unidad:'kg'},
  {id:'771dc480-e525-4ba8-8743-6c7ffc793381',nombre:'Panko',precio:7173.56,unidad:'kg'},
  {id:'9373be47-04b6-4733-87fc-5821bcff7d1d',nombre:'Papa',precio:1700,unidad:'kg'},
  {id:'10878128-2a1b-45dd-9041-a760537976c0',nombre:'Papines',precio:3200,unidad:'kg'},
  {id:'4d433327-4304-4f68-a7b6-ad746f4a47fb',nombre:'Pata muslo producida',precio:6600,unidad:'kg'},
  {id:'e4454e3b-fb4b-4c79-9f21-2c7dcbc587ca',nombre:'Pechuga producida',precio:8600,unidad:'kg'},
  {id:'42cccb14-4f9d-4b88-8dfe-a2a58500d86e',nombre:'Peperina',precio:42148.83,unidad:'kg'},
  {id:'9d26fece-42ed-4a06-acd1-fcb58841363e',nombre:'Pepino',precio:2257.82,unidad:'kg'},
  {id:'b4483286-92ea-429c-b2bc-f04d86e56601',nombre:'Peras',precio:2641.8,unidad:'kg'},
  {id:'36e7cf96-be80-4f09-9ff9-03c312afc76a',nombre:'Perejil',precio:8571.43,unidad:'kg'},
  {id:'f9709c7d-e182-45d4-8f9c-aaa814fc8571',nombre:'Picana de cordero',precio:14430,unidad:'kg'},
  {id:'5354107b-118c-493f-830c-23dd46f2514d',nombre:'Pimenton',precio:7438.02,unidad:'kg'},
  {id:'a8e43a7a-df45-4f59-af80-69bde416eb8b',nombre:'Pimienta blanca en grano',precio:29752.06,unidad:'kg'},
  {id:'1231514b-ec3e-484c-a657-12a73b8c241c',nombre:'Pimienta jamaica',precio:36251.17,unidad:'kg'},
  {id:'6e718cc2-f750-4e3a-bde9-ebeceab026a6',nombre:'Pimienta negra en grano',precio:18181.82,unidad:'kg'},
  {id:'8c6cd020-b3f5-440b-8e8a-b2914a784dc4',nombre:'Pimiento rojo',precio:4520.45,unidad:'kg'},
  {id:'b2207648-6132-46a6-ab90-3f1115bae888',nombre:'Pimiento verde',precio:3446.36,unidad:'kg'},
  {id:'1a9f8fe6-9ba3-4481-8c23-f0e617c9ad0a',nombre:'Polenta blanca',precio:3000,unidad:'kg'},
  {id:'ac222766-7530-4bf7-9d90-24a26503bc1e',nombre:'Polvo de hornear',precio:4673.6,unidad:'kg'},
  {id:'dd846a94-51b9-4ed5-a056-fb56d4095d4d',nombre:'Polvo de tomate',precio:25489.52,unidad:'kg'},
  {id:'070b7fa0-4a11-49fa-8744-b5f0cc4e3db1',nombre:'Pomelo',precio:2195.83,unidad:'kg'},
  {id:'7fb04e8c-c218-4cb8-8c5e-6501fada7997',nombre:'Poroto alubia',precio:2712.69,unidad:'kg'},
  {id:'71b3ad99-a487-4814-98dc-e71f15eb0115',nombre:'Poroto negro',precio:1422.53,unidad:'kg'},
  {id:'0bb1cb86-49e7-49cc-b5ef-be4613c841c5',nombre:'Portobello',precio:18000,unidad:'kg'},
  {id:'3d2301e9-1dd3-4d12-a514-142003e8a982',nombre:'Puerro',precio:5000,unidad:'unidad'},
  {id:'a4fcafae-f5da-410e-85cb-10d07cb350ec',nombre:'Queso crema',precio:5565.59,unidad:'l'},
  {id:'b5a12669-2eaf-472b-82e9-31d70ad4513d',nombre:'Queso cremoso',precio:7498.26,unidad:'kg'},
  {id:'c54ed7ed-0ec6-472e-b2f2-13c75e1fe9bf',nombre:'Queso Holanda',precio:12745.39,unidad:'kg'},
  {id:'798e8aae-f170-4652-8840-21ed034f9f98',nombre:'Remolacha',precio:2613.75,unidad:'kg'},
  {id:'cf9466df-bd52-4bbf-8d55-bdf55fd797d5',nombre:'Repollo blanco',precio:2125,unidad:'kg'},
  {id:'c0440185-8d30-456f-9989-865536f8ad89',nombre:'Repollo morado',precio:3500,unidad:'kg'},
  {id:'72dd1f41-8640-4e54-b062-ba4782850c78',nombre:'Ricota',precio:4757.45,unidad:'kg'},
  {id:'7bb46f3f-a616-41a7-ba0e-c402f80839d2',nombre:'Romanito estacionado',precio:12850.96,unidad:'kg'},
  {id:'d42a5f5c-3659-4749-b530-6414141d30d5',nombre:'Romero',precio:34000,unidad:'kg'},
  {id:'3c2c5aad-7ec0-47b8-99a9-79ae1041a4aa',nombre:'Rucula',precio:1500,unidad:'unidad'},
  {id:'6c39e07d-433d-482c-a008-80c4b8a9c9fb',nombre:'Rucula hidroponica',precio:1500,unidad:'unidad'},
  {id:'8b052d53-5d08-43bb-be64-b28d854b986a',nombre:'Sal en escama',precio:43441,unidad:'kg'},
  {id:'e5f3a99b-a3e5-40d1-a751-fe875f830891',nombre:'Sal entrefina',precio:1468.66,unidad:'kg'},
  {id:'384d3102-b80e-4ea5-8f52-c9e6208b5991',nombre:'Sal fina',precio:1705.87,unidad:'kg'},
  {id:'eb39dfaa-4c73-480b-99f2-2b2ca260d3d5',nombre:'Salsa de soja Sante',precio:4297.52,unidad:'l'},
  {id:'818f4931-0e71-41d1-8dc8-9e92444340c6',nombre:'Salsa inglesa',precio:4482.95,unidad:'l'},
  {id:'daca6279-cb4e-4a6d-85fb-607258173bda',nombre:'Semillas de girasol',precio:3272.72,unidad:'kg'},
  {id:'42c4b9ff-655f-4cac-a924-949a95578d84',nombre:'Semola rimacinata',precio:1649.16,unidad:'kg'},
  {id:'9f8715bd-755d-4852-8da8-74ee0f718445',nombre:'Semolin',precio:904.62,unidad:'kg'},
  {id:'e84d959c-8b8f-45ac-8910-a0d6b3ee2d95',nombre:'Sesamo blanco',precio:961.94,unidad:'kg'},
  {id:'c534ee6c-b254-4895-866b-dd66d7d76c1a',nombre:'Sesamo negro',precio:6694.22,unidad:'kg'},
  {id:'61b54bea-dc97-473a-8a2b-fc9d6a568d29',nombre:'Tomate perita',precio:1700,unidad:'kg'},
  {id:'58af688b-7ece-4388-8ff8-45978a797769',nombre:'Tomillo',precio:43714.29,unidad:'kg'},
  {id:'38c86ef1-3357-43b6-b1ce-db4b0533bb00',nombre:'Trigo burgol',precio:1428.09,unidad:'kg'},
  {id:'d4c467f6-a3d8-4ce4-90b8-c18668cb8b2c',nombre:'Trigo sarraceno',precio:6636,unidad:'kg'},
  {id:'ba442f34-f2ed-4be2-b34a-266fe5ff3f04',nombre:'Trucha',precio:21652.89,unidad:'kg'},
  {id:'f689e461-c822-49bc-860a-c9c0088419eb',nombre:'Urucum',precio:11900.8,unidad:'kg'},
  {id:'497cb5b3-4595-45b8-ae29-f19d4dea68d6',nombre:'Uva',precio:12000,unidad:'kg'},
  {id:'03beb6d7-83c9-420e-bb38-ce38ba7f8d7e',nombre:'Uva blanca',precio:3000,unidad:'kg'},
  {id:'eb623b0c-1972-4200-bda3-4c82054d719f',nombre:'Verdeo',precio:8000,unidad:'kg'},
  {id:'3f669154-b4c1-44cb-8fbf-54db7a7151f4',nombre:'Vinagre de alcohol',precio:956.84,unidad:'l'},
  {id:'0aa205f8-954f-45b1-8809-6bf01256e493',nombre:'Vinagre de arroz',precio:7509.31,unidad:'l'},
  {id:'3b05e4dd-c406-4e81-96ce-b8116a7d5d17',nombre:'Vinagre de manzana',precio:2137.89,unidad:'l'},
  {id:'95dbe1ac-378e-42c1-817a-adf78aa7d86a',nombre:'Vinagre de vino',precio:1431.5,unidad:'l'},
  {id:'03c55c32-0742-47e9-9ec0-7debe1f9388e',nombre:'Vino blanco',precio:1416.02,unidad:'l'},
  {id:'0cf421ce-cabf-4e23-b265-6a229d1cb29c',nombre:'Vino tinto',precio:1717.43,unidad:'l'},
  {id:'75267dc6-a515-4aba-a919-7fc25348ae20',nombre:'Zanahoria',precio:1715.45,unidad:'kg'},
]

// Extra manual mappings for context that the algorithm would miss
const MANUAL_OVERRIDES = {
  // ingredient name (normalized) -> product id to use
  'aceite': '45effe81-255e-4f1e-9f37-c6335484e612', // Aceite barbieri (generic)
  'aceite ajo': '45effe81-255e-4f1e-9f37-c6335484e612',
  'aceite de ajo': '45effe81-255e-4f1e-9f37-c6335484e612',
  'aceite de confitura': '45effe81-255e-4f1e-9f37-c6335484e612',
  'aceite de girasol': '45effe81-255e-4f1e-9f37-c6335484e612',
  'aceite de girasol barbieri': '45effe81-255e-4f1e-9f37-c6335484e612',
  'aceite de oliva': 'e2d9453e-0a0f-406b-86b2-ecd1fd3b021c', // Box 5L Zuelo
  'aceite de oliva zuelo original': 'e2d9453e-0a0f-406b-86b2-ecd1fd3b021c',
  'aceite natura': '45effe81-255e-4f1e-9f37-c6335484e612',
  'aceite rojo': '45effe81-255e-4f1e-9f37-c6335484e612',
  'aceite verde': '45effe81-255e-4f1e-9f37-c6335484e612',
  'aceitunas griegas': 'f53d8b4c-8622-4987-b485-a3ef2aff4b85',
  'aceitunas negras': 'f53d8b4c-8622-4987-b485-a3ef2aff4b85',
  'aceitunas verdes': 'f53d8b4c-8622-4987-b485-a3ef2aff4b85',
  'aji cayena': '7a296474-220f-48f6-8b38-c4915d628f45',
  'aji molido': '600ca3ea-d5fb-4d82-9bba-2a30b42681a2',
  'aji panca': 'e5533e2b-ae00-499b-b016-c9892601ec3e',
  'ajo asado': 'be59f75e-4be9-4d44-946b-b0d7fff6e9ff',
  'ajo dientes': 'be59f75e-4be9-4d44-946b-b0d7fff6e9ff',
  'albahaca fresca': '24b05999-3ad0-4bd0-a14f-723e695dd8fa',
  'almidón de maíz': 'bd4db459-9c40-44d8-8eac-0131e73248ed',
  'anchoa': 'ea9c8dc3-6226-436f-89a8-a29950849415',
  'arándanos': '1a1880f0-031e-422d-bc81-0c172525e34d', // frutillas (no arandanos, but close)
  'arvejas': '0ee8bea5-c8a4-4686-8f4f-c7aa995b1b37',
  'azúcar': 'd3529439-9572-4c76-8b33-6e8c0f752c61',
  'azúcar impalpable': '644ec160-449d-4fae-b791-668ee207f5ea',
  'azúcar morena': 'f1347b68-e27e-4758-bc09-8d3c584a40c5', // mascabo
  'azúcar rubia': 'f1347b68-e27e-4758-bc09-8d3c584a40c5',
  'berros': '31e7876f-145e-45e6-aab5-7d90866e7c2d',
  'brócoli': '8d51f19e-6487-4879-90b6-8c0951e98e2b',
  'cacao': '8a00298d-f2ea-405d-9895-b175173250ad',
  'cacao en polvo': '8a00298d-f2ea-405d-9895-b175173250ad',
  'canela': '174de5a5-7860-400d-8316-519753445d38', // polvo
  'canela en polvo': '174de5a5-7860-400d-8316-519753445d38',
  'canela en rama': 'dfcfaad6-5d64-430d-98cd-a18cd25bb675',
  'castañas': 'b3ac818e-b271-4815-9d28-cd4f375a2caa',
  'cayena': '7a296474-220f-48f6-8b38-c4915d628f45',
  'cebolla': '092d2790-f099-49b2-99db-294b820c18f6', // cebolla morada (closest)
  'cebolla caramelizada': '092d2790-f099-49b2-99db-294b820c18f6',
  'cebolla de verdeo': 'eb623b0c-1972-4200-bda3-4c82054d719f', // verdeo
  'cebollines': 'eb623b0c-1972-4200-bda3-4c82054d719f',
  'comino': '19e55222-a77c-4d56-9ff2-119036dfe806', // comino en polvo
  'crema': '923752dc-cf9f-4fcb-8e6d-58a336f47a2c',
  'crema de leche': '923752dc-cf9f-4fcb-8e6d-58a336f47a2c',
  'crema doble': '923752dc-cf9f-4fcb-8e6d-58a336f47a2c',
  'cúrcuma': 'e1b0b716-d941-416c-8c3c-24f171ea4c8c',
  'dátiles': '71248148-e3fd-409d-90a9-27ad28f7a16b',
  'espárragos': 'cc6b1ed8-ece9-4dbf-8b8f-5ca28bb38f5c',
  'espinaca': '81099105-5187-450a-b364-f69380988116',
  'fécula de mandioca': 'fb8104f6-ddf0-48fb-b766-4a09002df20c',
  'fécula de papa': '493b8271-0ab1-42e7-aaac-79b3f563647f',
  'frutillas': '1a1880f0-031e-422d-bc81-0c172525e34d',
  'gelatina': '88e16cee-6df0-4aed-88c3-bf8c514e6d43',
  'goma xántica': '7b46b7b2-aadf-4a61-adf3-2cbd56dd864f',
  'grasa vacuna': '46e36a51-be0a-4148-aa0d-3630c77a94ac',
  'harina': '90d46e6b-597f-429a-a495-138bcab2ba03', // 000 panadera
  'harina 000': '90d46e6b-597f-429a-a495-138bcab2ba03',
  'harina de almendras': 'b6f3d3ce-856f-45c5-8742-ceba7c1c3b30',
  'harina de arroz': '095fdccb-0df2-4454-91cb-2e91e5a25dcb',
  'harina de maíz': '2434e342-6462-4e9d-bf8e-777e5d5b3160',
  'hierbas aromáticas': '36e7cf96-be80-4f09-9ff9-03c312afc76a', // perejil (generic herbs)
  'huevo': '402481a9-9bf2-4dff-bcb6-897a902336a9',
  'jalapeño': '97daa22b-f390-47ba-abd8-3b2c60d8f4d6',
  'langostinos': 'f53d8b4c-8622-4987-b485-a3ef2aff4b85', // no langostinos in catalog - skip
  'langostinos jumbo': 'f53d8b4c-8622-4987-b485-a3ef2aff4b85', // skip
  'leche': 'ac5b8da1-812e-44cf-ba13-973d2e925fe6',
  'limón': '24eb9726-bcc8-4415-96b1-a54a7eb30920',
  'limones': '24eb9726-bcc8-4415-96b1-a54a7eb30920',
  'manteca': 'e0985d1a-55c1-48bf-af90-abfb04bc7893', // not in catalog - skip
  'manteca sin sal': 'e0985d1a-55c1-48bf-af90-abfb04bc7893', // skip
  'mantequilla': 'e0985d1a-55c1-48bf-af90-abfb04bc7893', // skip
  'mantequilla sin sal': 'e0985d1a-55c1-48bf-af90-abfb04bc7893', // skip
  'morcilla': 'a9c9b0d9-f6ad-4922-a513-0f66428f86ca',
  'mostaza': '1616c7bf-7047-4628-b5c8-cefe73041479',
  'mostaza dijon': '1616c7bf-7047-4628-b5c8-cefe73041479',
  'orégano': '7bae122f-7da1-4496-9c95-869eb50c3c1d',
  'palta': 'f53d8b4c-8622-4987-b485-a3ef2aff4b85', // no palta - skip
  'panceta': 'a9c9b0d9-f6ad-4922-a513-0f66428f86ca', // morcilla or grasa - use grasa cerdo
  'panceta ahumada': '2ff12da6-5b1d-4c51-aef7-12a7c7ccd568', // grasa cerdo
  'papas': '9373be47-04b6-4733-87fc-5821bcff7d1d',
  'pechuga de pollo': 'e4454e3b-fb4b-4c79-9f21-2c7dcbc587ca',
  'pata muslo': '4d433327-4304-4f68-a7b6-ad746f4a47fb',
  'picaña': 'f9709c7d-e182-45d4-8f9c-aaa814fc8571',
  'pimentón': '5354107b-118c-493f-830c-23dd46f2514d',
  'pimentón ahumado': '5354107b-118c-493f-830c-23dd46f2514d',
  'pimienta': '6e718cc2-f750-4e3a-bde9-ebeceab026a6', // pimienta negra en grano
  'pimienta blanca': 'a8e43a7a-df45-4f59-af80-69bde416eb8b',
  'pimienta de cayena': '7a296474-220f-48f6-8b38-c4915d628f45',
  'pimienta negra': '6e718cc2-f750-4e3a-bde9-ebeceab026a6',
  'pimienta rosada': '6e718cc2-f750-4e3a-bde9-ebeceab026a6',
  'polenta': '1a9f8fe6-9ba3-4481-8c23-f0e617c9ad0a',
  'pollo': '4d433327-4304-4f68-a7b6-ad746f4a47fb', // pata muslo or pechuga
  'portobello': '0bb1cb86-49e7-49cc-b5ef-be4613c841c5',
  'repollo': 'cf9466df-bd52-4bbf-8d55-bdf55fd797d5',
  'rúcula': '3c2c5aad-7ec0-47b8-99a9-79ae1041a4aa',
  'sal': 'e5f3a99b-a3e5-40d1-a751-fe875f830891', // sal entrefina
  'sal gruesa': 'e5f3a99b-a3e5-40d1-a751-fe875f830891',
  'salsa de soja': 'eb39dfaa-4c73-480b-99f2-2b2ca260d3d5',
  'salsa inglesa': '818f4931-0e71-41d1-8dc8-9e92444340c6',
  'soja': 'eb39dfaa-4c73-480b-99f2-2b2ca260d3d5',
  'sésamo': 'e84d959c-8b8f-45ac-8910-a0d6b3ee2d95',
  'sésamo blanco': 'e84d959c-8b8f-45ac-8910-a0d6b3ee2d95',
  'sésamo negro': 'c534ee6c-b254-4895-866b-dd66d7d76c1a',
  'tomate': '61b54bea-dc97-473a-8a2b-fc9d6a568d29',
  'tomate cherry': '61b54bea-dc97-473a-8a2b-fc9d6a568d29',
  'trucha': 'ba442f34-f2ed-4be2-b34a-266fe5ff3f04',
  'uva': '497cb5b3-4595-45b8-ae29-f19d4dea68d6',
  'verdeo': 'eb623b0c-1972-4200-bda3-4c82054d719f',
  'vinagre': '3f669154-b4c1-44cb-8fbf-54db7a7151f4', // vinagre de alcohol (generic)
  'vinagre balsámico': '0aa205f8-954f-45b1-8809-6bf01256e493', // vinagre de arroz (closest)
  'wok sauce': 'eb39dfaa-4c73-480b-99f2-2b2ca260d3d5', // salsa de soja
  'yema': '402481a9-9bf2-4dff-bcb6-897a902336a9', // huevos
  'zucchini': '9a28971a-2fa8-42a9-9091-17c0a377e828', // calabacin
}

// IDs that don't actually exist in catalog (hallucinated)
const INVALID_IDS = new Set([
  'e0985d1a-55c1-48bf-af90-abfb04bc7893', // manteca - not in catalog
  'f53d8b4c-0000-0000-0000-000000000001', // fake
  'b4fd8a88-3e89-4aba-be6e-c29a22cbc19f', // fake berro
  'b8768553-adcf-4e98-826f-f3e84b2893be', // langostinos - not in catalog
  '6e6a6bd8-3fe9-4ef1-a31c-d93b51ddf2d2', // pollo generic
  'd7a2f314-a3ee-4527-a4f6-5e8f0b4ae022', // limon different id
  'a4a30571-a7c8-4ee5-9499-9ad9b3a2b4cc', // azucar diff
  '46c50f0f-f14c-42da-b66f-9ee53c22cfaa', // azucar impalpable diff
  '4dc8b03b-bfaf-4c5e-b56c-1cc3c3db9459', // papa diff
  '75a9d5be-b03d-44c1-a07e-80e42c08e174', // miel diff
  'e2e3e556-6862-4ad4-bec3-88c6b3d65ebb', // mostaza diff
  '2a527baf-4be7-45a8-a41e-df2e07f13f64', // panceta diff
  '71e8a040-1ee5-44f2-8022-ccce49e9d3a6', // bife diff
  '1b6e9b03-2843-4613-a258-17f68dc18b4b', // harina diff
  '6e01a19a-1b71-4cdf-b9e2-dffb77d9a5b3', // cebolla diff
  'b8c6da36-af49-4e02-9c8c-8a0d64a5e553', // sal diff
  '19b14b0a-2905-4b92-83c0-7e3e5c1bed9d', // tomate diff
  'a7d05b8c-77a5-4d19-b3fb-98e09a83aeff', // salsa soja diff
  '6dd60543-1c09-4fa7-9e8a-b7e43e01dc70', // pimienta diff
  '4d8f0001-2e5f-4faa-8ea4-4f8de89a6ee4', // ternera
  '91f9c1d7-7ef0-48ef-90f7-4ef67d8e0cba', // crema diff
  'b90be2ab-7843-4a4b-83ea-b98fc74765ee', // albahaca/perejil diff
  '85ba1a13-5d22-46a8-9f91-1d59cda43f86', // almendras not in catalog
  'cbece71e-cb7f-4ba5-b6c0-6cf71d34f0bc', // alcaparras diff
  '7b1c6d34-a12e-4f87-9d24-63f7e8a0c514', // cacao diff
  '4cde02b3-6b9e-4a30-8c54-9f7e35f9b3df', // arandanos not in catalog
  '15a703cd-6e34-4d3a-ae1a-3ddd9e14e9cf', // arvejas diff
  'e44a7e8d-da77-4ebb-8f28-4a4e0a4c2ad9', // atun not in catalog
  'd35bf2c3-8937-4c7a-a6dd-4a7fae6d0eb4', // azafran not in catalog
  '0531ef24-a8ab-41a4-a89a-9a35e5f0fc77', // ajo en polvo - wrong UUID (97cc... not 9a35...)
  'c8b07db7-42f2-4b9e-8c0e-4c9d5ba96a8c', // huevos diff
  '81ee7b18-4f1b-43a5-bcaf-ebb3ab5e3b90', // leche diff
])

function normalize(s) {
  return s.toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g,' ')
}

function wordOverlap(a, b) {
  const words = s => s.split(' ').filter(w => w.length > 2)
  const wa = words(a)
  const wb = new Set(words(b))
  if (wa.length === 0 || wb.size === 0) return 0
  const shared = wa.filter(w => wb.has(w)).length
  return shared / Math.min(wa.length, wb.size)
}

function findMatch(ingrediente, productos) {
  const norm = normalize(ingrediente)

  // Check manual override first
  if (MANUAL_OVERRIDES[norm] && !INVALID_IDS.has(MANUAL_OVERRIDES[norm])) {
    const p = productos.find(p => p.id === MANUAL_OVERRIDES[norm])
    if (p) return {match: p, level: 'manual'}
  }

  // 1. Exact
  const exact = productos.find(p => normalize(p.nombre) === norm)
  if (exact) return {match: exact, level: 'exacto'}

  // 2. Containment
  const contains = productos.find(p => {
    const pn = normalize(p.nombre)
    return pn.includes(norm) || norm.includes(pn)
  })
  if (contains) return {match: contains, level: 'parcial'}

  // 3. Word overlap >= 0.7
  let best, bestScore = 0
  for (const p of productos) {
    const score = wordOverlap(norm, normalize(p.nombre))
    if (score >= 0.7 && score > bestScore) { bestScore = score; best = p }
  }
  if (best) return {match: best, level: 'fuzzy'}

  return null
}

// Get unique ingredient names from the actual DB query result
const ingredienteNames = [
  '5 especias','aceite','aceite ajo','aceite de ajo','aceite de confitura',
  'aceite de girasol','aceite de girasol barbieri','aceite de oliva',
  'aceite de oliva zuelo original','aceite natura','aceite rojo','aceite verde',
  'aceitunas griegas','aceitunas negras','aceitunas verdes','aceto',
  'aceto balsamico donna arletti','acido citrico','ácido cítrico',
  'agar agar','aji cayena','ají cayena','aji molido','ají molido',
  'aji panca','ají panca','ajo','ajo asado','ajo dientes','ajo en polvo',
  'albahaca','albahaca fresca','alcaparras','almidón de maíz',
  'anchoa','anchoas','anis estrellado','apio','arroz','arroz basmati',
  'arroz blanco','arándanos','arvejas','azúcar','azúcar impalpable',
  'azúcar morena','azúcar rubia','batata','berenjena','berro','berros',
  'bife de chorizo','bicarbonato','brócoli','cacao','cacao en polvo',
  'calabacin','canela','canela en polvo','canela en rama','cardamomo',
  'castañas','cayena','cebolla','cebolla caramelizada','cebolla morada',
  'cebolla de verdeo','cebollines','chaucha','chocolate','chocolate blanco',
  'chocolate negro','cilantro','ciruela','clavo de olor','coco rallado',
  'comino','crema','crema de leche','crema doble','cúrcuma','dátiles',
  'espárragos','espinaca','fécula de mandioca','fécula de papa','frutillas',
  'gelatina','gelatina sin sabor','glucosa','goma xántica','grasa vacuna',
  'harina','harina 000','harina de almendras','harina de arroz','harina de maíz',
  'hierbas aromáticas','hinojo','huevo','huevos','jalapeño','jengibre',
  'kale','laurel','leche','lenteja','lima','limón','limones','mango',
  'manteca','manteca sin sal','membrillo','menta','miel','miso','morcilla',
  'mostaza','mostaza dijon','naranja','nuez moscada','orégano','palta',
  'panceta','panceta ahumada','pan rallado','papa','papas','peperina',
  'pepino','peras','perejil','perejil fresco','pimentón','pimentón ahumado',
  'pimienta','pimienta blanca','pimienta de cayena','pimienta negra',
  'pimienta rosada','polenta','pollo','pechuga de pollo','pata muslo',
  'portobello','queso cremoso','queso crema','remolacha','repollo',
  'repollo blanco','repollo morado','ricota','romero','rúcula','sal',
  'sal entrefina','sal fina','sal gruesa','salsa de soja','salsa inglesa',
  'soja','sésamo','sésamo blanco','sésamo negro','tomate','tomate cherry',
  'tomate perita','tomillo','trucha','uva','verdeo','vinagre',
  'vinagre balsámico','vinagre de manzana','vino blanco','vino tinto',
  'wok sauce','yema','zanahoria','zucchini'
]

const results = []
const noMatch = []

for (const ing of ingredienteNames) {
  const found = findMatch(ing, productos)
  if (found) {
    results.push({
      ingrediente: ing,
      nombre_norm: normalize(ing),
      producto_id: found.match.id,
      producto_nombre: found.match.nombre,
      precio: found.match.precio,
      unidad: found.match.unidad,
      nivel: found.level
    })
  } else {
    noMatch.push(ing)
  }
}

console.log(`\nMatches: ${results.length}/${ingredienteNames.length}`)
console.log(`No match: ${noMatch.length}`)
console.log('\n--- MATCHES ---')
results.forEach(r =>
  console.log(`${r.nivel.padEnd(8)} | ${r.ingrediente.padEnd(35)} -> ${r.producto_nombre} ($${r.precio} ${r.unidad})`)
)
console.log('\n--- NO MATCH ---')
noMatch.forEach(n => console.log(' - ' + n))

writeFileSync('C:/Users/Equipo/Documents/kitchenos/scripts/matches-output.json', JSON.stringify(results, null, 2))
console.log('\nSaved to scripts/matches-output.json')
